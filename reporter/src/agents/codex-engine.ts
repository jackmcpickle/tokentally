import { asObject, toMs } from '../lib/parse-utils';
import { emptyTotals, num } from '../lib/totals';
import type { JsonObject, ReporterTotals } from '../lib/types';

/**
 * Codex rollout counting engine, ported from CodexBar's CostUsageScanner
 * (github.com/steipete/CodexBar, MIT — Vendored/CostUsage/CostUsageScanner.swift
 * and CodexSubagentRolloutShape.swift).
 *
 * Codex `token_count` events carry two views of usage: `last_token_usage`, a
 * per-turn delta, and `total_token_usage`, a cumulative counter. Neither can
 * be trusted alone: replayed/duplicated events re-emit deltas, resumed and
 * forked sessions restart or interleave cumulative counters, and subagent
 * rollouts copy a prefix of the parent's history. The engine arbitrates the
 * two views per event under a monotonic high watermark so no gap between
 * observed counters is ever counted twice.
 *
 * CodexBar tracks (input, cached, output); this port applies the identical
 * component-wise rules to all five reporter slots (adding cache-write and
 * reasoning), which generalizes the math without changing it.
 */

// ---------------------------------------------------------------------------
// Component-wise totals math (CostUsageScanner.swift codexTotals* helpers).

const TOTAL_KEYS = [
    'input_tokens',
    'output_tokens',
    'cache_read_tokens',
    'cache_creation_tokens',
    'reasoning_tokens',
] as const;

type Totals = ReporterTotals;

function totalsEqual(a: Totals | null, b: Totals | null): boolean {
    if (a === null || b === null) return a === b;
    return TOTAL_KEYS.every((k) => a[k] === b[k]);
}

function totalsAtLeast(a: Totals, b: Totals): boolean {
    return TOTAL_KEYS.every((k) => a[k] >= b[k]);
}

function totalsAtMost(a: Totals, b: Totals): boolean {
    return TOTAL_KEYS.every((k) => a[k] <= b[k]);
}

function totalsHaveUsage(t: Totals): boolean {
    return TOTAL_KEYS.some((k) => t[k] > 0);
}

function addTotals(a: Totals, b: Totals): Totals {
    const out = emptyTotals();
    for (const k of TOTAL_KEYS) out[k] = a[k] + b[k];
    return out;
}

function minTotals(a: Totals, b: Totals): Totals {
    const out = emptyTotals();
    for (const k of TOTAL_KEYS) out[k] = Math.min(a[k], b[k]);
    return out;
}

function maxTotals(a: Totals | null, b: Totals): Totals {
    if (a === null) return { ...b };
    const out = emptyTotals();
    for (const k of TOTAL_KEYS) out[k] = Math.max(a[k], b[k]);
    return out;
}

function totalDelta(baseline: Totals | null, current: Totals): Totals {
    const base = baseline ?? emptyTotals();
    const out = emptyTotals();
    for (const k of TOTAL_KEYS) out[k] = Math.max(0, current[k] - base[k]);
    return out;
}

// After totals and counted usage have diverged (a counter reset was absorbed),
// per-component: advance from the raw baseline when the counter is still above
// it, otherwise resume from what was actually counted.
function divergentTotalDelta(
    rawBaseline: Totals | null,
    countedBaseline: Totals | null,
    current: Totals,
): Totals {
    const raw = rawBaseline ?? emptyTotals();
    const counted = countedBaseline ?? emptyTotals();
    const out = emptyTotals();
    for (const k of TOTAL_KEYS) {
        out[k] =
            current[k] >= raw[k]
                ? Math.max(0, current[k] - raw[k])
                : Math.max(0, current[k] - counted[k]);
    }
    return out;
}

// Post-latch containment for interleaved cumulative counters (several fork
// lineages writing into one file): above the watermark, grow only past
// max(watermark, counted) so a high/low lineage flip can never re-count the
// gap; below it, resume from counted.
function containedTotalDelta(
    watermark: Totals | null,
    counted: Totals | null,
    current: Totals,
): Totals {
    const water = watermark ?? emptyTotals();
    const cnt = counted ?? emptyTotals();
    const out = emptyTotals();
    for (const k of TOTAL_KEYS) {
        out[k] =
            current[k] >= water[k]
                ? Math.max(0, current[k] - Math.max(water[k], cnt[k]))
                : Math.max(0, current[k] - cnt[k]);
    }
    return out;
}

// Post-latch event delta: contained totals growth, optionally capped by the
// event's own `last` — `last` alone must never add usage the totals deny.
function postLatchEventDelta(
    watermark: Totals | null,
    counted: Totals | null,
    current: Totals,
    adjustedLast: Totals | null,
): Totals {
    const contained = containedTotalDelta(watermark, counted, current);
    return adjustedLast === null
        ? contained
        : minTotals(adjustedLast, contained);
}

// Prefer the totals-derived delta over `last` when the cumulative counter is
// consistent (at or above its baseline) and the derived delta is no larger —
// this makes replayed `last` events harmless whenever totals didn't move.
function shouldPreferTotalDelta(
    rawBaseline: Totals | null,
    currentTotal: Totals,
    delta: Totals,
    lastDelta: Totals,
    sawDivergentTotals: boolean,
): boolean {
    if (sawDivergentTotals || rawBaseline === null) return false;
    return (
        totalsAtLeast(currentTotal, rawBaseline) &&
        totalsAtMost(delta, lastDelta)
    );
}

// ---------------------------------------------------------------------------
// Totals tracker (CodexTotalsTracker): monotonic high watermark, bounded
// exact-re-emission suppression, and the interleaved-lineage latch.

const SEEN_RAW_TOTALS_LIMIT = 64;

interface TotalsTracker {
    watermark: Totals | null;
    seenRawTotals: Totals[];
    sawInterleavedTotals: boolean;
}

function newTracker(watermark: Totals | null = null): TotalsTracker {
    return { watermark, seenRawTotals: [], sawInterleavedTotals: false };
}

function trackerIsSeen(tr: TotalsTracker, totals: Totals): boolean {
    return tr.seenRawTotals.some((t) => totalsEqual(t, totals));
}

// A monotonic counter cannot decrease; a drop below the watermark means a
// second lineage or a reset, and both must stop trusting gap-sized deltas.
function trackerLatchIfBelowWatermark(tr: TotalsTracker, totals: Totals): void {
    if (tr.watermark === null) return;
    if (TOTAL_KEYS.some((k) => totals[k] < (tr.watermark as Totals)[k])) {
        tr.sawInterleavedTotals = true;
    }
}

function trackerRaiseWatermark(tr: TotalsTracker, totals: Totals): void {
    tr.watermark = maxTotals(tr.watermark, totals);
}

function trackerCommitObserved(tr: TotalsTracker, totals: Totals): void {
    trackerRaiseWatermark(tr, totals);
    if (!trackerIsSeen(tr, totals)) {
        tr.seenRawTotals.push({ ...totals });
        if (tr.seenRawTotals.length > SEEN_RAW_TOTALS_LIMIT) {
            tr.seenRawTotals.splice(
                0,
                tr.seenRawTotals.length - SEEN_RAW_TOTALS_LIMIT,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Snapshot accumulator (CodexSnapshotAccumulator): replays a parent rollout's
// token_count stream under the same containment rules, so fork children
// inherit baselines computed exactly as the parent's own scan would count.

interface SnapshotAccumulator {
    countedTotals: Totals | null;
    rawTotalsBaseline: Totals | null;
    sawDivergentTotals: boolean;
    tracker: TotalsTracker;
}

export function newSnapshotAccumulator(): SnapshotAccumulator {
    return {
        countedTotals: null,
        rawTotalsBaseline: null,
        sawDivergentTotals: false,
        tracker: newTracker(),
    };
}

export function accumulatorApply(
    acc: SnapshotAccumulator,
    last: Totals | null,
    total: Totals | null,
): Totals {
    const base = acc.countedTotals ?? emptyTotals();
    if (total !== null) {
        if (trackerIsSeen(acc.tracker, total)) return base;
        trackerLatchIfBelowWatermark(acc.tracker, total);
    }
    const watermarkBaseline = acc.tracker.watermark ?? acc.rawTotalsBaseline;
    function commit(): void {
        if (total !== null) trackerCommitObserved(acc.tracker, total);
    }

    if (last !== null) {
        let countedDelta = last;
        if (total !== null) {
            if (acc.tracker.sawInterleavedTotals) {
                countedDelta = postLatchEventDelta(
                    watermarkBaseline,
                    acc.countedTotals,
                    total,
                    last,
                );
            } else {
                const delta = totalDelta(watermarkBaseline, total);
                if (
                    shouldPreferTotalDelta(
                        watermarkBaseline,
                        total,
                        delta,
                        last,
                        acc.sawDivergentTotals,
                    )
                ) {
                    countedDelta = delta;
                }
            }
            const next = addTotals(base, countedDelta);
            acc.countedTotals = next;
            acc.rawTotalsBaseline = total;
            if (!totalsEqual(total, next)) acc.sawDivergentTotals = true;
            commit();
            return next;
        }
        const next = addTotals(base, countedDelta);
        acc.countedTotals = next;
        acc.rawTotalsBaseline = next;
        trackerRaiseWatermark(acc.tracker, next);
        return next;
    }

    if (total !== null) {
        let delta: Totals;
        if (acc.tracker.sawInterleavedTotals) {
            delta = containedTotalDelta(
                watermarkBaseline,
                acc.countedTotals,
                total,
            );
        } else if (acc.sawDivergentTotals) {
            delta = divergentTotalDelta(
                watermarkBaseline,
                acc.countedTotals,
                total,
            );
        } else {
            delta = totalDelta(watermarkBaseline, total);
        }
        const counted = addTotals(base, delta);
        acc.countedTotals = counted;
        acc.rawTotalsBaseline = total;
        if (!totalsEqual(total, counted)) acc.sawDivergentTotals = true;
        commit();
        return counted;
    }

    return base;
}

// ---------------------------------------------------------------------------
// Line extraction. One rollout line becomes at most one engine record.

export interface CodexSessionMeta {
    sessionId: string | null;
    forkedFromId: string | null;
    forkTimestamp: string | null;
    isSubagentThread: boolean;
    // CodexBar reads models from turn_context only; session_meta model is
    // kept as extra evidence for older rollouts that predate turn_context.
    model: string | null;
}

interface TokenCountRecord {
    model: string | null;
    last: Totals | null;
    total: Totals | null;
}

type CodexLine =
    | { kind: 'meta'; meta: CodexSessionMeta }
    // `model: ''` explicitly clears stale context; null means "no model field".
    | { kind: 'turnContext'; model: string | null }
    | { kind: 'interAgent'; triggerTurn: boolean }
    | { kind: 'tokenCount'; rec: TokenCountRecord };

function modelEvidence(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return trimmed === '' ? null : trimmed;
}

function turnContextModel(payload: JsonObject): string | null {
    const info = asObject(payload.info);
    const candidates = [
        payload.model,
        payload.model_name,
        info.model,
        info.model_name,
    ];
    let sawCandidate = false;
    for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue;
        sawCandidate = true;
        const model = modelEvidence(candidate);
        if (model !== null) return model;
    }
    return sawCandidate ? '' : null;
}

function forkParentId(payload: JsonObject): string | null {
    const source = asObject(payload.source);
    // CodexBar reads the flat fork keys; real thread-spawn subagent metadata
    // additionally nests the parent under source.subagent(.thread_spawn).
    const subagent = asObject(source.subagent);
    const candidates = [
        payload.forked_from_id,
        payload.forkedFromId,
        payload.parent_session_id,
        payload.parentSessionId,
        source.forked_from_id,
        asObject(subagent.thread_spawn).parent_thread_id,
        subagent.parent_thread_id,
    ];
    for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue;
        const trimmed = candidate.trim();
        if (trimmed) return trimmed;
    }
    return null;
}

function isSubagentThread(payload: JsonObject): boolean {
    const source = payload.source;
    if (typeof source === 'string') {
        return source.trim().toLowerCase() === 'subagent';
    }
    const subagent = asObject(source).subagent;
    return (
        typeof subagent === 'string' ||
        (subagent !== null && typeof subagent === 'object')
    );
}

function sessionMetaFrom(
    obj: JsonObject,
    payload: JsonObject,
): CodexSessionMeta {
    const idCandidates = [
        payload.id,
        obj.id,
        payload.session_id,
        payload.sessionId,
        obj.session_id,
        obj.sessionId,
    ];
    let sessionId: string | null = null;
    for (const candidate of idCandidates) {
        if (typeof candidate === 'string' && candidate) {
            sessionId = candidate;
            break;
        }
    }
    const ts = payload.timestamp ?? obj.timestamp;
    return {
        sessionId,
        forkedFromId: forkParentId(payload),
        forkTimestamp: typeof ts === 'string' ? ts : null,
        isSubagentThread: isSubagentThread(payload),
        model:
            modelEvidence(payload.model) ??
            modelEvidence(asObject(payload.turn_context).model) ??
            modelEvidence(asObject(payload.info).model),
    };
}

function usageTotals(value: unknown): Totals | null {
    if (value === null || typeof value !== 'object') return null;
    const usage = value as JsonObject;
    return {
        input_tokens: num(usage.input_tokens),
        output_tokens: num(usage.output_tokens),
        cache_read_tokens: num(
            usage.cached_input_tokens ?? usage.cache_read_input_tokens,
        ),
        cache_creation_tokens: num(usage.cache_write_input_tokens),
        reasoning_tokens: num(usage.reasoning_output_tokens),
    };
}

function isTurnBoundary(obj: JsonObject, payload: JsonObject): boolean {
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

function codexLineFrom(obj: JsonObject): CodexLine | null {
    const payload = asObject(obj.payload);
    if (obj.type === 'session_meta') {
        return { kind: 'meta', meta: sessionMetaFrom(obj, payload) };
    }
    if (obj.type === 'turn_context') {
        return { kind: 'turnContext', model: turnContextModel(payload) };
    }
    if (
        obj.type === 'inter_agent_communication_metadata' ||
        (obj.type === 'event_msg' &&
            payload.type === 'inter_agent_communication_metadata')
    ) {
        return {
            kind: 'interAgent',
            triggerTurn: isTurnBoundary(obj, payload),
        };
    }
    if (obj.type === 'event_msg' && payload.type === 'token_count') {
        const info = asObject(payload.info);
        const last = usageTotals(info.last_token_usage);
        const total = usageTotals(info.total_token_usage);
        if (last === null && total === null) return null;
        const model =
            modelEvidence(info.model) ??
            modelEvidence(info.model_name) ??
            modelEvidence(payload.model) ??
            modelEvidence(obj.model);
        return { kind: 'tokenCount', rec: { model, last, total } };
    }
    return null;
}

// ---------------------------------------------------------------------------
// Subagent rollout shape (CodexSubagentRolloutShape.swift). Subagent source is
// lineage evidence, not counter semantics: embedded ancestor session_meta
// lines prove a copied prefix by themselves; compact rollouts need both the
// first-turn boundary (turn_context immediately followed by a trigger_turn
// marker) and an exact parent snapshot match to confirm a local boundary.

interface BufferedLine {
    lineIndex: number;
    line: CodexLine;
}

interface OwnedSuffix {
    startLineIndex: number;
    rawTotalsBaseline: Totals;
}

interface SubagentShape {
    copiedPrefix: boolean;
    ownedSuffix: OwnedSuffix | null;
    ownedSuffixCandidate: {
        ownedSuffix: OwnedSuffix;
        parentTotalsAtBoundary: Totals;
    } | null;
    inferredParentSessionId: string | null;
}

function normalizedSessionId(value: string | null): string | null {
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
}

export function sameConcreteSessionId(
    a: string | null,
    b: string | null,
): boolean {
    const na = normalizedSessionId(a);
    const nb = normalizedSessionId(b);
    return na !== null && nb !== null && na === nb;
}

function classifySubagentShape(
    leafSessionId: string | null,
    buffered: BufferedLine[],
    hasExplicitParent: boolean,
): SubagentShape {
    const normalizedLeaf = normalizedSessionId(leafSessionId);
    const metadataIds: (string | null)[] = [];
    for (const b of buffered) {
        if (b.line.kind === 'meta') metadataIds.push(b.line.meta.sessionId);
    }

    const hasEmbeddedAncestor =
        normalizedLeaf === null
            ? metadataIds.length > 1 ||
              metadataIds.some((id) => normalizedSessionId(id) !== null)
            : metadataIds.some(
                  (id) => normalizedSessionId(id) !== normalizedLeaf,
              );
    const distinctAncestors = new Set(
        metadataIds
            .map(normalizedSessionId)
            .filter(
                (id): id is string =>
                    id !== null &&
                    (normalizedLeaf === null || id !== normalizedLeaf),
            ),
    );
    const inferredParentSessionId =
        distinctAncestors.size === 1
            ? ([...distinctAncestors][0] ?? null)
            : null;

    const copiedPrefix = hasEmbeddedAncestor;
    const canProposeParentConfirmedSuffix = !copiedPrefix && hasExplicitParent;
    if (!copiedPrefix && !canProposeParentConfirmedSuffix) {
        return {
            copiedPrefix,
            ownedSuffix: null,
            ownedSuffixCandidate: null,
            inferredParentSessionId,
        };
    }

    let lastRawTotals: Totals | null = null;
    let pendingTurnContext: { lineIndex: number; baseline: Totals } | null =
        null;
    let ownedSuffix: OwnedSuffix | null = null;
    let parentTotalsAtBoundary: Totals | null = null;
    let inspectedOwnedSuffixFirstTotal = false;
    let observedAuthoritativeMetadata = false;
    let observedTurnContext = false;

    for (const { lineIndex, line } of buffered) {
        switch (line.kind) {
            case 'meta': {
                const normalizedId = normalizedSessionId(line.meta.sessionId);
                const isEmbeddedAncestor =
                    observedAuthoritativeMetadata &&
                    (normalizedLeaf === null ||
                        normalizedId !== normalizedLeaf);
                observedAuthoritativeMetadata = true;
                if (isEmbeddedAncestor) {
                    // A later ancestor meta proves any earlier candidate
                    // boundary was replay.
                    ownedSuffix = null;
                    parentTotalsAtBoundary = null;
                    inspectedOwnedSuffixFirstTotal = false;
                }
                pendingTurnContext = null;
                break;
            }
            case 'turnContext': {
                const isFirstTurnContext = !observedTurnContext;
                observedTurnContext = true;
                const acceptsBoundary =
                    copiedPrefix ||
                    (canProposeParentConfirmedSuffix && isFirstTurnContext);
                pendingTurnContext =
                    acceptsBoundary && lastRawTotals !== null
                        ? { lineIndex, baseline: lastRawTotals }
                        : null;
                break;
            }
            case 'interAgent': {
                if (
                    ownedSuffix === null &&
                    line.triggerTurn &&
                    pendingTurnContext !== null &&
                    lineIndex === pendingTurnContext.lineIndex + 1 &&
                    (copiedPrefix ||
                        totalsHaveUsage(pendingTurnContext.baseline))
                ) {
                    ownedSuffix = {
                        startLineIndex: pendingTurnContext.lineIndex,
                        rawTotalsBaseline: pendingTurnContext.baseline,
                    };
                    parentTotalsAtBoundary = pendingTurnContext.baseline;
                    inspectedOwnedSuffixFirstTotal = false;
                }
                pendingTurnContext = null;
                break;
            }
            case 'tokenCount': {
                const { total, last } = line.rec;
                if (
                    !inspectedOwnedSuffixFirstTotal &&
                    ownedSuffix !== null &&
                    total !== null
                ) {
                    inspectedOwnedSuffixFirstTotal = true;
                    if (
                        last !== null &&
                        totalsEqual(total, last) &&
                        !totalsAtLeast(total, ownedSuffix.rawTotalsBaseline)
                    ) {
                        // Copied history followed by a counter restart:
                        // total==last reset evidence at a strong boundary.
                        ownedSuffix = {
                            startLineIndex: ownedSuffix.startLineIndex,
                            rawTotalsBaseline: emptyTotals(),
                        };
                    }
                }
                if (total !== null) lastRawTotals = total;
                pendingTurnContext = null;
                break;
            }
            default:
                break;
        }
    }

    if (copiedPrefix) {
        return {
            copiedPrefix: true,
            ownedSuffix,
            ownedSuffixCandidate: null,
            inferredParentSessionId,
        };
    }
    return {
        copiedPrefix: false,
        ownedSuffix: null,
        ownedSuffixCandidate:
            ownedSuffix !== null && parentTotalsAtBoundary !== null
                ? { ownedSuffix, parentTotalsAtBoundary }
                : null,
        inferredParentSessionId,
    };
}

// ---------------------------------------------------------------------------
// Fork baseline resolution.

export type CodexForkBaseline =
    | { resolved: Totals | null }
    | { unresolved: true };

export type CodexForkResolver = (
    parentSessionId: string,
    forkedAt: string,
) => CodexForkBaseline;

export interface CodexEngineOpts {
    sessionId?: string;
    fallbackStartedAt?: number | null;
    resolveParent?: CodexForkResolver;
}

export interface ParsedCodexRollout {
    session_id: string | null;
    started_at: number | null;
    models: Map<string, ReporterTotals>;
    parent_id: string | null;
}

// ---------------------------------------------------------------------------
// Main parse (parseCodexFileCancellable).

export function parseCodexRollout(
    text: string,
    opts: CodexEngineOpts = {},
): ParsedCodexRollout {
    const models = new Map<string, ReporterTotals>();

    let currentModel: string | null = null;
    let previousTotals: Totals | null = null;
    let sessionId: string | null = null;
    let forkedFromId: string | null = null;
    let subagentThread = false;
    let didCaptureLeafMetadata = false;
    let forkTimestamp: string | null = null;
    let subagentSemanticsKnown = false;
    let subagentCopiedPrefix = false;
    let usesLocalSubagentBoundary = false;
    let suppressUnownedCopiedPrefix = false;
    let inheritedTotals: Totals | null = null;
    let remainingInheritedTotals: Totals | null = null;
    let forkBaselineResolved = false;
    let hasUnresolvedForkBaseline = false;
    let unresolvedForkTotalWatermark: Totals | null = null;
    let rawTotalsBaseline: Totals | null = null;
    let sawDivergentTotals = false;
    let tracker = newTracker();
    let startedAt: number | null = null;

    let pendingSubagentLines: BufferedLine[] | null = null;

    function ensureModelRow(model: string): void {
        // Zero-total rows keep the server upsert able to overwrite rows an
        // earlier reporter version inflated for this (session, model).
        if (!models.has(model)) models.set(model, emptyTotals());
    }

    function addModelDelta(model: string, delta: Totals): void {
        ensureModelRow(model);
        const t = models.get(model) as Totals;
        for (const k of TOTAL_KEYS) t[k] += delta[k];
    }

    function resolveForkBaseline(parentSessionId: string, at: string): void {
        if (forkBaselineResolved) return;
        if (!opts.resolveParent) return;
        forkBaselineResolved = true;
        const baseline = opts.resolveParent(parentSessionId, at);
        if ('resolved' in baseline) {
            inheritedTotals = baseline.resolved;
            remainingInheritedTotals = baseline.resolved
                ? { ...baseline.resolved }
                : null;
            hasUnresolvedForkBaseline = false;
        } else {
            hasUnresolvedForkBaseline = true;
        }
    }

    function configureForkAccountingIfReady(): void {
        if (forkedFromId === null) return;
        if (subagentThread && !subagentSemanticsKnown) return;
        if (
            (subagentSemanticsKnown && !subagentCopiedPrefix) ||
            usesLocalSubagentBoundary
        ) {
            // Independent counters and locally delimited suffixes bypass the
            // parent baseline entirely.
            forkBaselineResolved = true;
            inheritedTotals = null;
            remainingInheritedTotals = null;
            hasUnresolvedForkBaseline = false;
            return;
        }
        resolveForkBaseline(forkedFromId, forkTimestamp ?? '');
    }

    function handleSessionMeta(meta: CodexSessionMeta): void {
        // The first session_meta is the authoritative leaf. Copied prefixes
        // can embed many ancestor metas; they are shape evidence, never new
        // identity.
        if (didCaptureLeafMetadata) {
            if (!sameConcreteSessionId(meta.sessionId, sessionId)) return;
            if (meta.model !== null) currentModel = meta.model;
            if (forkedFromId === null && meta.forkedFromId !== null) {
                forkedFromId = meta.forkedFromId;
                forkTimestamp = meta.forkTimestamp ?? forkTimestamp;
                configureForkAccountingIfReady();
            }
            return;
        }
        didCaptureLeafMetadata = true;
        sessionId = meta.sessionId;
        forkedFromId = meta.forkedFromId;
        forkTimestamp = meta.forkTimestamp;
        subagentThread = meta.isSubagentThread;
        if (meta.model !== null) currentModel = meta.model;
        configureForkAccountingIfReady();
    }

    function handleTokenCount(rec: TokenCountRecord): void {
        const model =
            modelEvidence(currentModel) ??
            modelEvidence(rec.model) ??
            'unknown';
        ensureModelRow(model);
        if (suppressUnownedCopiedPrefix) return;

        const { total, last } = rec;

        function adjustedLastDelta(rawDelta: Totals): Totals {
            if (remainingInheritedTotals === null) return rawDelta;
            const remaining = remainingInheritedTotals;
            const adjusted = emptyTotals();
            const nextRemaining = emptyTotals();
            for (const k of TOTAL_KEYS) {
                adjusted[k] = Math.max(0, rawDelta[k] - remaining[k]);
                nextRemaining[k] = Math.max(0, remaining[k] - rawDelta[k]);
            }
            remainingInheritedTotals = totalsHaveUsage(nextRemaining)
                ? nextRemaining
                : null;
            return adjusted;
        }

        // Fork totals are normalized against the inherited baseline;
        // classified independent counters and local suffixes bypassed it in
        // configureForkAccountingIfReady.
        const adjustedTotal =
            total !== null &&
            inheritedTotals !== null &&
            !hasUnresolvedForkBaseline
                ? totalDelta(inheritedTotals, total)
                : total;

        if (adjustedTotal !== null) {
            if (trackerIsSeen(tracker, adjustedTotal)) return;
            trackerLatchIfBelowWatermark(tracker, adjustedTotal);
        }
        const watermarkBaseline = tracker.watermark ?? rawTotalsBaseline;
        function commitObserved(): void {
            if (adjustedTotal !== null) {
                trackerCommitObserved(tracker, adjustedTotal);
            }
        }

        function totalsDerivedDelta(current: Totals): Totals {
            if (tracker.sawInterleavedTotals) {
                return containedTotalDelta(
                    watermarkBaseline,
                    previousTotals,
                    current,
                );
            }
            if (sawDivergentTotals) {
                return divergentTotalDelta(
                    watermarkBaseline,
                    previousTotals,
                    current,
                );
            }
            return totalDelta(watermarkBaseline, current);
        }

        let delta = emptyTotals();

        function commitDelta(d: Totals, rawBaseline: Totals): void {
            delta = d;
            previousTotals = addTotals(previousTotals ?? emptyTotals(), d);
            rawTotalsBaseline = rawBaseline;
            if (!totalsEqual(rawTotalsBaseline, previousTotals)) {
                sawDivergentTotals = true;
            }
        }

        const handledUnresolvedForkTotal =
            hasUnresolvedForkBaseline && total !== null;
        if (hasUnresolvedForkBaseline && total !== null) {
            // The watermark variable is a presence sentinel for "skip the
            // first unresolved-fork totals row"; delta baselines come from
            // the shared tracker.
            const sawPriorTotal = unresolvedForkTotalWatermark !== null;
            unresolvedForkTotalWatermark = total;
            if (last === null || !sawPriorTotal) {
                commitObserved();
                return;
            }
            const adjusted = minTotals(
                last,
                totalDelta(watermarkBaseline, total),
            );
            delta = adjusted;
            previousTotals = addTotals(
                previousTotals ?? emptyTotals(),
                adjusted,
            );
            rawTotalsBaseline = previousTotals;
        }

        if (
            !handledUnresolvedForkTotal &&
            adjustedTotal !== null &&
            forkedFromId !== null &&
            !hasUnresolvedForkBaseline
        ) {
            // Resolved forks keep totals-only accounting; after the latch,
            // containment capped by (inheritance-adjusted) last.
            const d = tracker.sawInterleavedTotals
                ? postLatchEventDelta(
                      watermarkBaseline,
                      previousTotals,
                      adjustedTotal,
                      last === null ? null : adjustedLastDelta(last),
                  )
                : totalsDerivedDelta(adjustedTotal);
            commitDelta(d, adjustedTotal);
            remainingInheritedTotals = null;
        } else if (!handledUnresolvedForkTotal && last !== null) {
            const hadRemainingInherited = remainingInheritedTotals !== null;
            let adjusted = adjustedLastDelta(last);
            if (adjustedTotal !== null && !hasUnresolvedForkBaseline) {
                if (tracker.sawInterleavedTotals) {
                    adjusted = postLatchEventDelta(
                        watermarkBaseline,
                        previousTotals,
                        adjustedTotal,
                        adjusted,
                    );
                    remainingInheritedTotals = null;
                } else {
                    const totalD = totalDelta(watermarkBaseline, adjustedTotal);
                    if (
                        !hadRemainingInherited &&
                        shouldPreferTotalDelta(
                            watermarkBaseline,
                            adjustedTotal,
                            totalD,
                            last,
                            sawDivergentTotals,
                        )
                    ) {
                        adjusted = totalD;
                        remainingInheritedTotals = null;
                    }
                }
                commitDelta(adjusted, adjustedTotal);
            } else {
                delta = adjusted;
                previousTotals = addTotals(
                    previousTotals ?? emptyTotals(),
                    adjusted,
                );
                rawTotalsBaseline = previousTotals;
                trackerRaiseWatermark(tracker, previousTotals);
            }
        } else if (!handledUnresolvedForkTotal && adjustedTotal !== null) {
            commitDelta(totalsDerivedDelta(adjustedTotal), adjustedTotal);
            remainingInheritedTotals = null;
        } else if (!handledUnresolvedForkTotal) {
            commitObserved();
            return;
        }

        commitObserved();
        if (totalsHaveUsage(delta)) addModelDelta(model, delta);
    }

    function processLine(line: CodexLine): void {
        switch (line.kind) {
            case 'meta':
                handleSessionMeta(line.meta);
                break;
            case 'turnContext':
                if (line.model !== null) currentModel = line.model;
                break;
            case 'interAgent':
                break;
            case 'tokenCount':
                handleTokenCount(line.rec);
                break;
            default:
                break;
        }
    }

    // Single pass with a prelude buffer: lines before the first session_meta
    // are held so a subagent leaf can arm buffering from the top of the file.
    let prelude: BufferedLine[] | null = [];
    let lineIndex = -1;
    for (const raw of text.split('\n')) {
        lineIndex += 1;
        const trimmed = raw.trim();
        if (!trimmed) continue;
        let obj: JsonObject;
        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (parsed === null || typeof parsed !== 'object') continue;
            obj = parsed as JsonObject;
        } catch {
            continue;
        }
        if (startedAt === null) startedAt = toMs(obj.timestamp);
        const line = codexLineFrom(obj);
        if (line === null) continue;

        if (line.kind === 'meta' && !didCaptureLeafMetadata) {
            handleSessionMeta(line.meta);
            if (subagentThread) {
                // Buffer parsed events (not JSON) so classification stays one
                // pass and replays through the same totals reducer. The leaf
                // meta joins the buffer: classification's ancestor-reset
                // logic keys off it being the first authoritative record.
                pendingSubagentLines = prelude ?? [];
                pendingSubagentLines.push({ lineIndex, line });
            } else if (prelude !== null) {
                for (const held of prelude) processLine(held.line);
            }
            prelude = null;
            continue;
        }
        if (prelude !== null) {
            prelude.push({ lineIndex, line });
            continue;
        }
        if (pendingSubagentLines !== null) {
            pendingSubagentLines.push({ lineIndex, line });
            continue;
        }
        processLine(line);
    }
    if (prelude !== null) {
        // No session_meta in the file at all.
        for (const held of prelude) processLine(held.line);
        prelude = null;
    }

    if (pendingSubagentLines !== null) {
        // Same-leaf restarts can fill lineage fields after the opening
        // record; collect them before classification so an owned-suffix
        // filter cannot discard the only fork identifier.
        for (const b of pendingSubagentLines) {
            if (b.line.kind !== 'meta') continue;
            const meta = b.line.meta;
            if (!sameConcreteSessionId(meta.sessionId, sessionId)) continue;
            if (forkedFromId === null && meta.forkedFromId !== null) {
                forkedFromId = meta.forkedFromId;
                forkTimestamp = meta.forkTimestamp ?? forkTimestamp;
            }
        }

        const shape = classifySubagentShape(
            sessionId,
            pendingSubagentLines,
            forkedFromId !== null,
        );
        subagentSemanticsKnown = true;
        subagentCopiedPrefix = shape.copiedPrefix;
        if (forkedFromId === null) {
            forkedFromId = shape.inferredParentSessionId;
        }
        let ownedSuffix = shape.ownedSuffix;
        if (
            shape.ownedSuffixCandidate !== null &&
            forkedFromId !== null &&
            opts.resolveParent
        ) {
            // A candidate boundary in an otherwise independent-looking file
            // is only trusted when the parent's counted totals at the
            // boundary match exactly.
            const baseline = opts.resolveParent(
                forkedFromId,
                forkTimestamp ?? '',
            );
            if (
                'resolved' in baseline &&
                totalsEqual(
                    baseline.resolved,
                    shape.ownedSuffixCandidate.parentTotalsAtBoundary,
                )
            ) {
                subagentCopiedPrefix = true;
                ownedSuffix = shape.ownedSuffixCandidate.ownedSuffix;
            }
        }
        suppressUnownedCopiedPrefix =
            subagentCopiedPrefix &&
            ownedSuffix === null &&
            forkedFromId === null;
        if (ownedSuffix !== null) {
            usesLocalSubagentBoundary = true;
            previousTotals = null;
            // Keep totals-derived accounting after the boundary: flat-total
            // rows repeat the previous payload with a fresh timestamp, so
            // their non-zero `last` is replay evidence, not new usage.
            rawTotalsBaseline = ownedSuffix.rawTotalsBaseline;
            sawDivergentTotals = false;
            tracker = newTracker({ ...ownedSuffix.rawTotalsBaseline });
            currentModel = null;
            unresolvedForkTotalWatermark = null;
        }
        configureForkAccountingIfReady();

        const start = ownedSuffix?.startLineIndex ?? -Infinity;
        // Dropped copied-prefix events still pin zero-total model rows so a
        // corrected report overwrites previously inflated uploads.
        let droppedModel: string | null = null;
        for (const b of pendingSubagentLines) {
            if (b.lineIndex >= start) {
                processLine(b.line);
                continue;
            }
            if (b.line.kind === 'turnContext' && b.line.model !== null) {
                droppedModel = b.line.model;
            } else if (b.line.kind === 'tokenCount') {
                ensureModelRow(
                    modelEvidence(droppedModel) ??
                        modelEvidence(b.line.rec.model) ??
                        'unknown',
                );
            }
        }
    }

    return {
        session_id: sessionId ?? opts.sessionId ?? null,
        started_at: startedAt ?? opts.fallbackStartedAt ?? null,
        models,
        parent_id: forkedFromId,
    };
}

// ---------------------------------------------------------------------------
// Parent snapshot stream (parseCodexTokenSnapshots): the counted cumulative
// totals after every token_count event, for fork baseline selection.

export interface CodexSnapshot {
    ts: string;
    tsMs: number | null;
    totals: ReporterTotals;
}

export function codexTokenSnapshots(text: string): {
    sessionId: string | null;
    snapshots: CodexSnapshot[];
} {
    let snapSessionId: string | null = null;
    const acc = newSnapshotAccumulator();
    const snapshots: CodexSnapshot[] = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let obj: JsonObject;
        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (parsed === null || typeof parsed !== 'object') continue;
            obj = parsed as JsonObject;
        } catch {
            continue;
        }
        const payload = asObject(obj.payload);
        if (obj.type === 'session_meta') {
            if (snapSessionId === null) {
                snapSessionId = sessionMetaFrom(obj, payload).sessionId;
            }
            continue;
        }
        if (obj.type !== 'event_msg' || payload.type !== 'token_count')
            continue;
        const info = asObject(payload.info);
        const last = usageTotals(info.last_token_usage);
        const total = usageTotals(info.total_token_usage);
        if (last === null && total === null) continue;
        const ts = typeof obj.timestamp === 'string' ? obj.timestamp : '';
        snapshots.push({
            ts,
            tsMs: toMs(ts),
            totals: accumulatorApply(acc, last, total),
        });
    }
    return { sessionId: snapSessionId, snapshots };
}
