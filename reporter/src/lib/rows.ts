import { basename } from 'node:path';
import type { ParsedTranscript, ReporterRow } from './types';

/** session id from a filename, stripping known prefixes/suffixes. */
export function sessionIdFromPath(path: string): string {
    let name = basename(path).replace(/\.jsonl$/iu, '');
    name = name.replace(/^rollout-/iu, '');
    return name;
}

/** Claude Code `<synthetic>` turns — never report or score. */
export function isSyntheticModel(model: unknown): boolean {
    if (typeof model !== 'string') return false;
    const m = model.toLowerCase().trim().replace(/^<|>$/gu, '');
    return m === 'synthetic';
}

/** Turn a parsed result into API session rows (one per model). */
export function toRows(parsed: ParsedTranscript, path?: string): ReporterRow[] {
    const sid = parsed.session_id ?? sessionIdFromPath(path ?? '');
    const startedAt = parsed.started_at ?? Date.now();
    const rows: ReporterRow[] = [];
    for (const [model, t] of parsed.models) {
        if (isSyntheticModel(model)) continue;
        rows.push({ session_id: sid, model, started_at: startedAt, ...t });
    }
    return rows;
}
