import type { JsonObject } from './types';

export function asObject(value: unknown): JsonObject {
    return value !== null && typeof value === 'object'
        ? (value as JsonObject)
        : {};
}

export function toMs(ts: unknown): number | null {
    if (typeof ts !== 'string') return null;
    const n = Date.parse(ts);
    return Number.isFinite(n) ? n : null;
}

/** Yield each parseable JSON object from a JSONL text, skipping bad lines. */
export function* jsonlObjects(text: string): Generator<JsonObject> {
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (parsed !== null && typeof parsed === 'object') {
                yield parsed as JsonObject;
            }
        } catch {
            /* skip unparseable line */
        }
    }
}
