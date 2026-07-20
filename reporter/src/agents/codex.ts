import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { walkJsonl } from '../lib/fs-walk';
import { toMs } from '../lib/parse-utils';
import { sessionIdFromPath } from '../lib/rows';
import type { ReporterTotals } from '../lib/types';
import {
    type CodexForkBaseline,
    type CodexForkResolver,
    type CodexSnapshot,
    codexTokenSnapshots,
} from './codex-engine';

export { parseCodexRollout } from './codex-engine';
export type { CodexForkResolver } from './codex-engine';

export function codexDirs(): string[] {
    const home = homedir();
    return [
        join(home, '.codex', 'sessions'),
        join(home, '.codex', 'archived_sessions'),
    ];
}

export const CODEX_ROLLOUT_FILE = /^rollout-.*\.jsonl$/iu;

// Index of local Codex rollouts by session UUID, used to resolve the
// declared parent of subagent/fork children whose inherited baseline must be
// replayed from the parent rollout. Filenames look like
// rollout-2026-07-18T09-00-00-<uuid>.jsonl; keys are lowercased so lookups
// by parent id are case-insensitive. Files without a trailing UUID are keyed
// by their stripped name minus any leading timestamp.
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
    // the more complete history. A file that cannot be stat'ed scores -1, so
    // an unreadable copy never displaces a readable one.
    if (prev !== undefined && fileSize(f) <= fileSize(prev)) return;
    map.set(key, f);
}

/**
 * Drop duplicate copies of a session before parsing/uploading: the same
 * rollout can sit in both sessions/ and archived_sessions/ (or a stale
 * truncated copy beside the live one), and uploading both would let the
 * smaller copy's row race the fuller one on the server's replace-upsert.
 * Keeps the largest copy per session, preserving input order.
 */
export function dedupeCodexRolloutFiles(files: string[]): string[] {
    const best = new Map<string, string>();
    for (const f of files) addCodexRolloutToIndex(best, f);
    const keep = new Set(best.values());
    return files.filter((f) => keep.has(f));
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
            // Same duplicate rule as addCodexRolloutToIndex: larger file
            // wins; -1 for an unstattable one.
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

// Parent snapshot streams by session id, memoized so a parent that spawned
// many children is read and replayed once per run — only sessions actually
// referenced as a parent are ever loaded. Read failures are not cached, so a
// transient error on one child does not pin every later sibling to
// "unresolved parent".
const codexSnapshotsById = new Map<
    string,
    { sessionId: string | null; snapshots: CodexSnapshot[] }
>();

function codexForkBaseline(
    parentSessionId: string,
    forkedAt: string,
    childPath: string | null,
): CodexForkBaseline {
    // No usable fork timestamp: the parent's counted totals at the fork
    // point cannot be selected, so the child falls to conservative
    // accounting rather than guessing a baseline.
    if (!parentSessionId || !forkedAt) return { unresolved: true };
    const id = parentSessionId.toLowerCase();
    const path = codexRolloutPathById(
        id,
        childPath ? dirname(childPath) : null,
    );
    if (path === null) return { unresolved: true };
    // A parent that resolves to the child's own file (self-referential or
    // colliding metadata) must not be replayed — the child would inherit
    // its own totals and zero itself out. File identity, not path spelling:
    // the hook may supply a case-variant path on APFS.
    if (childPath !== null && isSameFile(path, childPath)) {
        return { unresolved: true };
    }
    let parent = codexSnapshotsById.get(id);
    if (parent === undefined) {
        let text: string;
        try {
            text = readFileSync(path, 'utf8');
        } catch {
            return { unresolved: true };
        }
        parent = codexTokenSnapshots(text);
        codexSnapshotsById.set(id, parent);
    }
    // The resolved file must actually be the requested session — a filename
    // collision replaying someone else's totals would fabricate a baseline.
    if (parent.sessionId === null || parent.sessionId.toLowerCase() !== id) {
        return { unresolved: true };
    }
    const cutoffMs = toMs(forkedAt);
    let inherited: ReporterTotals | null = null;
    for (const snap of parent.snapshots) {
        // Timestamp comparison when both parse; lexical fallback otherwise
        // (rollout timestamps are ISO-8601, so lexical order matches time).
        const atOrBefore =
            snap.tsMs !== null && cutoffMs !== null
                ? snap.tsMs <= cutoffMs
                : snap.ts <= forkedAt;
        if (atOrBefore) inherited = snap.totals;
    }
    return { resolved: inherited };
}

/**
 * Fork-baseline resolver for one child rollout: finds the declared parent's
 * rollout locally, replays its token_count stream under the same containment
 * rules as a normal scan, and returns the parent's counted totals at or
 * before the fork timestamp. Everything is read locally — nothing extra
 * leaves the machine.
 */
export function codexForkResolverFor(
    childPath: string | null,
): CodexForkResolver {
    return (parentSessionId, forkedAt) =>
        codexForkBaseline(parentSessionId, forkedAt, childPath);
}
