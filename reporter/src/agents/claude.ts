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
import { CLAUDE_USAGE_FIELDS } from '../lib/usage-fields';

export function claudeDirs(): string[] {
    const home = homedir();
    return [
        join(home, '.claude', 'projects'),
        join(home, '.config', 'claude', 'projects'),
    ];
}

interface ClaudeUsageRow {
    key: string | null;
    model: string;
    usage: ReporterTotals;
}

// One assistant transcript line's usage, or null when it carries none.
// `key` is `${message.id}:${requestId}` when either id is present; streamed
// chunks of one API message share it, so keyed rows dedupe last-wins.
function claudeUsageRow(obj: JsonObject): ClaudeUsageRow | null {
    if (obj.type !== 'assistant') return null;
    const msg = asObject(obj.message);
    if (!msg.usage || typeof msg.usage !== 'object') return null;
    const usage = asObject(msg.usage);
    const messageId = typeof msg.id === 'string' ? msg.id : '';
    const requestId = typeof obj.requestId === 'string' ? obj.requestId : '';
    return {
        key: messageId || requestId ? `${messageId}:${requestId}` : null,
        model:
            typeof msg.model === 'string' && msg.model ? msg.model : 'unknown',
        usage: usageFromFields(usage, CLAUDE_USAGE_FIELDS),
    };
}

function sumClaudeRows(rows: ClaudeUsageRow[]): Map<string, ReporterTotals> {
    const models = new Map<string, ReporterTotals>();
    for (const { model, usage } of rows) {
        accumulateModelUsage(models, model, usage);
    }
    return models;
}

/**
 * Parse a Claude Code transcript (JSONL). One transcript = one session that may
 * touch several models. Returns { session_id, started_at, models: {model: totals} }.
 *
 * Streaming writes several transcript lines per API message, each carrying
 * cumulative usage; rows sharing a `message.id`/`requestId` key are deduped
 * last-wins so only the final chunk counts. Rows without either id can never
 * collide and are all kept.
 */
export function parseClaudeTranscript(
    text: string,
    opts: ParseOpts = {},
): ParsedTranscript {
    let sessionId = opts.sessionId ?? null;
    let startedAt: number | null = null;
    const keyed = new Map<string, ClaudeUsageRow>();
    const unkeyed: ClaudeUsageRow[] = [];

    for (const obj of jsonlObjects(text)) {
        if (startedAt === null) startedAt = toMs(obj.timestamp);
        if (!sessionId && typeof obj.sessionId === 'string')
            sessionId = obj.sessionId;
        const row = claudeUsageRow(obj);
        if (!row) continue;
        if (row.key === null) unkeyed.push(row);
        else keyed.set(row.key, row);
    }

    return {
        session_id: sessionId ?? opts.sessionId ?? null,
        started_at: startedAt ?? opts.fallbackStartedAt ?? null,
        models: sumClaudeRows([...keyed.values(), ...unkeyed]),
    };
}
