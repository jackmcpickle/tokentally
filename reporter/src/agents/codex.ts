import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { asObject, jsonlObjects, toMs } from '../lib/parse-utils.ts';
import {
    accumulateModelUsage,
    emptyTotals,
    num,
    usageFromFields,
} from '../lib/totals.ts';
import { sessionIdFromPath } from '../lib/rows.ts';
import type {
    CodexPendingUsage,
    JsonObject,
    ParseOpts,
    ParsedCodexRollout,
    ReporterTotals,
} from '../lib/types.ts';
import { CODEX_USAGE_FIELDS } from '../lib/usage-fields.ts';
import { walkJsonl } from '../lib/fs-walk.ts';

interface CodexParseState {
    sessionId: string | null;
    startedAt: number | null;
    currentModel: string;
    metaSeen: boolean;
    parentId: string | null;
    parentSpawn: boolean;
    inherited: boolean;
    pending: CodexPendingUsage[];
}

interface InheritedRun {
    consumed: number;
    matched: number;
    distinctive: boolean;
    steps: number;
}

export function codexDirs(): string[] {
    const home = homedir();
    return [
        join(home, '.codex', 'sessions'),
        join(home, '.codex', 'archived_sessions'),
    ];
}

export const CODEX_ROLLOUT_FILE = /^rollout-.*\.jsonl$/iu;

function accumulateCodexUsage(
    models: Map<string, ReporterTotals>,
    model: string,
    last: Record<string, unknown>,
): void {
    accumulateModelUsage(
        models,
        model,
        usageFromFields(last, CODEX_USAGE_FIELDS),
    );
}

// Codex subagent/fork children replay part of the parent rollout's history —
// including its token_count events — before their own first turn. Counting
// those would double-count usage already reported under the parent session
// (the parent and child have distinct session ids, so server idempotency
// cannot catch it).
//
// `spawn: true` (thread-spawn subagents) means the file carries a trigger_turn
// boundary marker separating replay from real usage. Forks have no such
// marker of their own — a later trigger_turn in a fork's file would be from
// the fork spawning its own subagent — so they are always resolved against
// the parent rollout at EOF instead.
function codexParentMeta(
    payload: JsonObject,
): { id: string; spawn: boolean } | null {
    const source = asObject(payload.source);
    const subagent = asObject(source.subagent);
    const threadSpawn = asObject(subagent.thread_spawn);
    const spawnId = threadSpawn.parent_thread_id ?? subagent.parent_thread_id;
    if (typeof spawnId === 'string' && spawnId)
        return { id: spawnId, spawn: true };
    const forkId = source.forked_from_id ?? payload.forked_from_id;
    if (typeof forkId === 'string' && forkId)
        return { id: forkId, spawn: false };
    return null;
}

// Multi-agent v2 rollouts mark the child's first real turn with an
// inter_agent_communication_metadata event carrying trigger_turn: true.
// Everything before it is replayed parent history.
function isCodexTurnBoundary(obj: JsonObject, payload: JsonObject): boolean {
    if (
        obj.type !== 'inter_agent_communication_metadata' &&
        !(
            obj.type === 'event_msg' &&
            payload.type === 'inter_agent_communication_metadata'
        )
    ) {
        return false;
    }
    const info = asObject(payload.info);
    return payload.trigger_turn === true || info.trigger_turn === true;
}

function applyCodexSessionMeta(
    payload: JsonObject,
    state: CodexParseState,
): void {
    if (typeof payload.id === 'string')
        state.sessionId = state.sessionId ?? payload.id;
    const m = modelFromContext(payload);
    if (m) state.currentModel = m;
    // Only the file's own (first) session_meta can declare this session's
    // parent. Later session_meta lines — appended on resume, or the parent's
    // own meta inside replayed history — must not (re-)arm inheritance: after
    // the boundary that would divert genuine child usage into pending, and a
    // replayed grandparent id would make prefix matching hit the wrong file.
    if (state.metaSeen) return;
    state.metaSeen = true;
    const parent = codexParentMeta(payload);
    if (parent) {
        state.parentId = parent.id;
        state.parentSpawn = parent.spawn;
        state.inherited = true;
    }
}

function applyCodexTurnContext(
    payload: JsonObject,
    state: CodexParseState,
): void {
    const m = modelFromContext(payload);
    if (m) state.currentModel = m;
}

function processCodexLine(
    obj: JsonObject,
    state: CodexParseState,
    models: Map<string, ReporterTotals>,
): void {
    if (state.startedAt === null) state.startedAt = toMs(obj.timestamp);
    const payload = asObject(obj.payload);

    if (obj.type === 'session_meta') {
        applyCodexSessionMeta(payload, state);
        return;
    }
    if (obj.type === 'turn_context') {
        applyCodexTurnContext(payload, state);
        return;
    }
    // The boundary marker only delimits a thread-spawn child's own replay;
    // forks resolve against the parent rollout at EOF instead. The first
    // marker in a spawn child's file is its own spawn boundary: replayed
    // parent history does not carry markers, and markers from the child's
    // own later subagent activity can only appear after this one has
    // disarmed inheritance (v1 files predate the marker entirely and never
    // contain one, so they always take the EOF resolution path).
    if (
        state.inherited &&
        state.parentSpawn &&
        isCodexTurnBoundary(obj, payload)
    ) {
        dropInheritedPending(state, models);
        return;
    }
    if (obj.type === 'event_msg' && payload.type === 'token_count') {
        const info = asObject(payload.info);
        const last = info.last_token_usage;
        if (!last || typeof last !== 'object') return;
        if (state.inherited) {
            // Possibly replayed parent history — hold until the turn boundary
            // (dropped there) or EOF (resolved against the parent rollout).
            state.pending.push({
                model: state.currentModel,
                last: last as Record<string, unknown>,
            });
            return;
        }
        accumulateCodexUsage(
            models,
            state.currentModel,
            last as Record<string, unknown>,
        );
    }
}

// Discard held replay, but keep a zero-total row for every model it touched:
// the pre-fix reporter posted the replayed usage under those (session, model)
// keys, and the server upsert can only overwrite the inflated rows if a
// corrected report still submits them.
function dropInheritedPending(
    state: CodexParseState,
    models: Map<string, ReporterTotals>,
): void {
    for (const { model } of state.pending) {
        if (!models.has(model)) models.set(model, emptyTotals());
    }
    state.pending.length = 0;
    state.inherited = false;
}

/**
 * Parse a Codex rollout (JSONL). Attributes each turn's `last_token_usage` to the
 * model active at that point (from session_meta / turn_context).
 *
 * Subagent/fork children (session_meta declares a parent) replay parent token
 * history before their own first turn; those events are excluded at the
 * trigger_turn boundary. Legacy children without the boundary marker return
 * the held events in `pending_inherited` plus `parent_id` — pass the parent
 * rollout text to resolveCodexInherited() to strip the replayed prefix.
 */
export function parseCodexRollout(
    text: string,
    opts: ParseOpts = {},
): ParsedCodexRollout {
    const models = new Map<string, ReporterTotals>();
    const state: CodexParseState = {
        sessionId: opts.sessionId ?? null,
        startedAt: null,
        currentModel: 'unknown',
        metaSeen: false,
        parentId: null,
        parentSpawn: false,
        inherited: false,
        pending: [],
    };

    for (const obj of jsonlObjects(text)) {
        processCodexLine(obj, state, models);
    }

    return {
        session_id: state.sessionId ?? opts.sessionId ?? null,
        started_at: state.startedAt ?? opts.fallbackStartedAt ?? null,
        models,
        parent_id: state.parentId,
        // Emptied at the boundary, so anything left is unresolved held usage.
        pending_inherited: state.pending,
    };
}

function codexUsageKey(last: Record<string, unknown>): string {
    return [
        num(last.input_tokens),
        num(last.cached_input_tokens),
        num(last.cache_write_input_tokens),
        num(last.output_tokens),
        num(last.reasoning_output_tokens),
    ].join('|');
}

/** Ordered token-count tuple sequence of a rollout, for parent-prefix matching. */
function codexTokenSequence(text: string): string[] {
    const keys: string[] = [];
    for (const obj of jsonlObjects(text)) {
        const payload = asObject(obj.payload);
        if (obj.type !== 'event_msg' || payload.type !== 'token_count')
            continue;
        const last = asObject(payload.info).last_token_usage;
        if (last && typeof last === 'object')
            keys.push(codexUsageKey(last as Record<string, unknown>));
    }
    return keys;
}

// A tuple with real input is very unlikely to repeat by coincidence; all-zero
// or output-only tuples can.
function isDistinctiveKey(key: string): boolean {
    return !key.startsWith('0|');
}

// Walk childKeys against parentKeys starting at parentKeys[start]. Replayed
// prefixes occasionally carry a token_count row duplicated back-to-back that
// the parent's own file has only once; a strict positional walk would stop at
// the duplicate and leave the whole inherited prefix counted. A child tuple
// equal to the immediately preceding child tuple is therefore consumed
// without advancing the parent. Skipped duplicates count toward `consumed`
// (they are replayed rows and must be dropped with the rest) but never
// toward `matched` — the evidence thresholds and the distinctive-tuple
// requirement are measured on genuine parent matches only, so the tolerance
// does not weaken the bar. Every comparison, including a skip, is charged
// one step against `budget`.
function matchInheritedRun(
    parentKeys: string[],
    childKeys: string[],
    start: number,
    budget: number,
): InheritedRun {
    const run: InheritedRun = {
        consumed: 0,
        matched: 0,
        distinctive: false,
        steps: 0,
    };
    let p = start;
    while (run.consumed < childKeys.length && run.steps < budget) {
        run.steps += 1;
        const key = childKeys[run.consumed];
        if (key === undefined) break;
        if (p < parentKeys.length && parentKeys[p] === key) {
            run.matched += 1;
            if (isDistinctiveKey(key)) run.distinctive = true;
            run.consumed += 1;
            p += 1;
        } else if (run.consumed > 0 && key === childKeys[run.consumed - 1]) {
            run.consumed += 1;
        } else {
            break;
        }
    }
    return run;
}

// Replayed history is the parent's rollout from its beginning up to the
// spawn/fork point, so a genuine replay normally matches the parent's own
// initial token sequence — the comparison is anchored at the parent's start
// so a coincidental value match elsewhere in the parent (identical small
// turns are common) cannot silently discard genuine child usage. When the
// anchor misses (parent file compacted since the spawn, or the parent is
// itself a subagent whose file starts with its own inherited replay), an
// interior match is accepted only with stronger evidence: at least three
// matched tuples. Either way the matched run must contain a distinctive
// tuple — real replay always carries input-bearing turns, while all-zero or
// output-only tuples are exactly the ones that repeat by coincidence. A
// single-event match may always be coincidence and is never dropped — the
// cost is at most one duplicated turn for a parent that spawned after a
// single turn, which the source audit also treated as unconfirmable.
// Adjacent duplicate child tuples are tolerated (see matchInheritedRun); the
// returned length counts child events consumed, duplicates included, while
// the thresholds count genuine parent matches only.
function inheritedPrefixLength(
    parentKeys: string[],
    childKeys: string[],
): number {
    const anchored = matchInheritedRun(parentKeys, childKeys, 0, Infinity);
    if (anchored.matched >= 2 && anchored.distinctive) return anchored.consumed;

    // Bound the interior scan: a pathological parent full of repeated
    // non-distinctive tuples must not turn a session-end hook quadratic.
    // On exhaustion, fall through with the best run found so far (counting
    // is the safe direction).
    let steps = 200_000;
    let best: InheritedRun | null = null;
    for (let i = 1; i < parentKeys.length && steps > 0; i += 1) {
        steps -= 1;
        if (parentKeys[i] !== childKeys[0]) continue;
        const run = matchInheritedRun(parentKeys, childKeys, i, steps);
        steps -= run.steps;
        if (
            best === null ||
            run.matched > best.matched ||
            (run.matched === best.matched && run.consumed > best.consumed)
        ) {
            best = run;
        }
    }
    if (best !== null && best.matched >= 3 && best.distinctive)
        return best.consumed;
    return 0;
}

/**
 * Resolve a child rollout's held token events (a legacy thread-spawn file
 * without the trigger_turn marker, or any fork). The initial run matching the
 * parent rollout's own initial token sequence is replayed parent history and
 * is dropped; the remainder is genuine child usage and is counted. `parent`
 * is the parent rollout's text (or its precomputed token sequence); without
 * it (parent not found locally) everything is counted, preserving the old
 * behaviour.
 */
export function resolveCodexInherited(
    parsed: ParsedCodexRollout,
    parent?: string | string[] | null,
): ParsedCodexRollout {
    const pending = parsed.pending_inherited ?? [];
    if (pending.length === 0) return parsed;
    const parentKeys = Array.isArray(parent)
        ? parent
        : typeof parent === 'string' && parent
          ? codexTokenSequence(parent)
          : [];
    const drop = inheritedPrefixLength(
        parentKeys,
        pending.map((p) => codexUsageKey(p.last)),
    );
    // Zero-total rows for dropped models keep the server upsert able to
    // overwrite rows the pre-fix reporter inflated for this session.
    for (const { model } of pending.slice(0, drop)) {
        if (!parsed.models.has(model)) parsed.models.set(model, emptyTotals());
    }
    for (const { model, last } of pending.slice(drop)) {
        accumulateCodexUsage(parsed.models, model, last);
    }
    parsed.pending_inherited = [];
    return parsed;
}

function modelFromContext(payload: JsonObject): string | null {
    if (typeof payload.model === 'string' && payload.model)
        return payload.model;
    const nested =
        asObject(payload.turn_context).model ?? asObject(payload.info).model;
    return typeof nested === 'string' && nested ? nested : null;
}

// Index of local Codex rollouts by session UUID, used to resolve the
// declared parent of subagent/fork children whose replayed history must be
// matched against the parent rollout. Filenames look like
// rollout-2026-07-18T09-00-00-<uuid>.jsonl; keys are lowercased so lookups
// by parent_thread_id are case-insensitive. Files without a trailing UUID
// are keyed by their stripped name minus any leading timestamp.
let codexRolloutsById: Map<string, string> | null = null;

function fileSize(path: string): number {
    try {
        return statSync(path).size;
    } catch {
        return -1;
    }
}

// True when both paths name the same on-disk file, regardless of path
// spelling (case-insensitive filesystems, symlinks, ./ prefixes).
function isSameFile(a: string, b: string): boolean {
    try {
        const sa = statSync(a);
        const sb = statSync(b);
        return sa.dev === sb.dev && sa.ino === sb.ino;
    } catch {
        return resolve(a) === resolve(b);
    }
}

function addCodexRolloutToIndex(map: Map<string, string>, f: string): void {
    const m = basename(f).match(
        /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/iu,
    );
    const key = (
        m?.[1] ??
        sessionIdFromPath(f).replace(
            /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/iu,
            '',
        )
    ).toLowerCase();
    const prev = map.get(key);
    // Duplicate copies of one session (e.g. a stale copy left in
    // archived_sessions): rollouts are append-only, so the larger file has
    // the more complete history — matching against a truncated copy would
    // let replayed events past the truncation point be counted. A file that
    // cannot be stat'ed scores -1, so an unreadable copy never displaces a
    // readable one (and never gets pinned by a failure on the other side).
    if (prev !== undefined && fileSize(f) <= fileSize(prev)) return;
    map.set(key, f);
}

// Backfill already enumerates every rollout; let it seed the index instead
// of paying a second full directory walk on the first parent lookup.
export function seedCodexRolloutIndex(files: string[]): void {
    if (codexRolloutsById !== null) return;
    codexRolloutsById = new Map();
    for (const f of files) addCodexRolloutToIndex(codexRolloutsById, f);
}

function codexRolloutPathById(
    id: string,
    nearDir: string | null,
): string | null {
    if (typeof id !== 'string' || !id) return null;
    const lower = id.toLowerCase();
    // Session-end hooks handle a single file; a parent usually sits in the
    // same dated directory as its child, so probe there before paying a
    // full recursive walk of every session directory for one lookup.
    if (codexRolloutsById === null && nearDir) {
        try {
            // Same duplicate rule as addCodexRolloutToIndex: a stale
            // truncated copy of the session may sit beside the complete one,
            // and matching against it would count replayed events past the
            // truncation point. Larger file wins; -1 for an unstattable one.
            let bestPath: string | null = null;
            let bestSize = -1;
            for (const n of readdirSync(nearDir)) {
                if (
                    !CODEX_ROLLOUT_FILE.test(n) ||
                    !n.toLowerCase().includes(lower)
                )
                    continue;
                const full = join(nearDir, n);
                const size = fileSize(full);
                if (bestPath === null || size > bestSize) {
                    bestPath = full;
                    bestSize = size;
                }
            }
            if (bestPath !== null) return bestPath;
        } catch {
            /* fall through to the full index */
        }
    }
    if (codexRolloutsById === null) {
        seedCodexRolloutIndex(
            codexDirs().flatMap((d) =>
                walkJsonl(d, 0, (n) => CODEX_ROLLOUT_FILE.test(n)),
            ),
        );
    }
    return codexRolloutsById?.get(lower) ?? null;
}

// Parent token sequences by session id, memoized so a parent that spawned
// many children is read and tokenized once per run — only sessions actually
// referenced as a parent are ever loaded. Read failures are not cached, so a
// transient error on one child does not leave every later sibling resolving
// against nothing.
const codexSequencesById = new Map<string, string[]>();

export function codexParentSequenceById(
    parentId: string | null | undefined,
    childPath?: string | null,
): string[] | null {
    if (typeof parentId !== 'string' || !parentId) return null;
    const id = parentId.toLowerCase();
    const path = codexRolloutPathById(
        id,
        childPath ? dirname(childPath) : null,
    );
    if (!path) return null;
    // A parent that resolves to the child's own file (self-referential or
    // colliding metadata) must not be matched against — the child's whole
    // sequence would match itself and every token would be dropped. This
    // check must run before the cache (a hit for a legitimate earlier child
    // must not bypass it) and on file identity rather than path spelling:
    // the hook may supply an unnormalized or case-variant path (APFS is
    // case-insensitive) that names the same file under a different string.
    if (childPath && isSameFile(path, childPath)) return null;
    const cached = codexSequencesById.get(id);
    if (cached) return cached;
    let keys: string[];
    try {
        keys = codexTokenSequence(readFileSync(path, 'utf8'));
    } catch {
        return null;
    }
    codexSequencesById.set(id, keys);
    return keys;
}
