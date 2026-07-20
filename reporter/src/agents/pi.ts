import { homedir } from 'node:os';
import { join } from 'node:path';
import { asObject, jsonlObjects, toMs } from '../lib/parse-utils';
import { accumulateModelUsage, usageFromFields } from '../lib/totals';
import type {
    JsonObject,
    ParseOpts,
    ParsedTranscript,
    ReporterTotals,
} from '../lib/types';
import { PI_USAGE_FIELDS } from '../lib/usage-fields';

interface PiParseState {
    sessionId: string | null;
    startedAt: number | null;
    currentModel: string;
}

function piUsage(obj: JsonObject): JsonObject | null {
    if (obj.usage && typeof obj.usage === 'object') return asObject(obj.usage);
    const nested = asObject(obj.message).usage;
    return nested && typeof nested === 'object' ? asObject(nested) : null;
}

function piModel(obj: JsonObject): string | null {
    const m =
        obj.model ??
        obj.modelID ??
        asObject(obj.message).model ??
        asObject(obj.usage).model;
    return typeof m === 'string' && m ? m : null;
}

function piSessionId(obj: JsonObject): string | null {
    if (typeof obj.sessionId === 'string') return obj.sessionId;
    if (typeof obj.session_id === 'string') return obj.session_id;
    return null;
}

function processPiLine(
    obj: JsonObject,
    state: PiParseState,
    models: Map<string, ReporterTotals>,
    seen: Set<string>,
): void {
    if (state.startedAt === null)
        state.startedAt = toMs(obj.timestamp ?? obj.time);
    if (!state.sessionId) state.sessionId = piSessionId(obj);

    const model = piModel(obj);
    if (model) state.currentModel = model;

    const usage = piUsage(obj);
    if (!usage) return;

    // Skip records already counted on another branch of the tree.
    if (typeof obj.id === 'string') {
        if (seen.has(obj.id)) return;
        seen.add(obj.id);
    }

    accumulateModelUsage(
        models,
        state.currentModel,
        usageFromFields(usage, PI_USAGE_FIELDS),
    );
}

/**
 * Parse a pi session file (JSONL). pi stores a *tree* of records keyed by
 * `id`/`parentId` in one file, so the same record can appear more than once —
 * we dedupe by `id` before summing each record's `usage` per active model.
 */
export function parsePiRollout(
    text: string,
    opts: ParseOpts = {},
): ParsedTranscript {
    const models = new Map<string, ReporterTotals>();
    const seen = new Set<string>();
    const state: PiParseState = {
        sessionId: opts.sessionId ?? null,
        startedAt: null,
        currentModel: 'unknown',
    };

    for (const obj of jsonlObjects(text)) {
        processPiLine(obj, state, models, seen);
    }

    return {
        session_id: state.sessionId ?? opts.sessionId ?? null,
        started_at: state.startedAt ?? opts.fallbackStartedAt ?? null,
        models,
    };
}

// pi stores one JSONL file per session, nested under a per-directory slug.
export function piDirs(): string[] {
    const explicit =
        process.env.PI_CODING_AGENT_SESSION_DIR ?? process.env.PI_AGENT_DIR;
    const dirs = explicit ? [explicit] : [];
    dirs.push(join(homedir(), '.pi', 'agent', 'sessions'));
    return dirs;
}
