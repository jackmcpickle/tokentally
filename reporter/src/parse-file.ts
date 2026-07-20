import { readFileSync, statSync } from 'node:fs';
import { parseClaudeTranscript } from './agents/claude';
import { codexForkResolverFor, parseCodexRollout } from './agents/codex';
import { parsePiRollout } from './agents/pi';
import { toRows } from './lib/rows';
import type { ParsedTranscript, ReporterRow } from './lib/types';

export function parseFile(path: string, source: string): ReporterRow[] {
    const text = readFileSync(path, 'utf8');
    let fallbackStartedAt: number | null = null;
    try {
        fallbackStartedAt = statSync(path).mtimeMs;
    } catch {
        /* ignore */
    }
    let parsed: ParsedTranscript;
    if (source === 'codex') {
        parsed = parseCodexRollout(text, {
            fallbackStartedAt,
            resolveParent: codexForkResolverFor(path),
        });
    } else if (source === 'pi')
        parsed = parsePiRollout(text, { fallbackStartedAt });
    else parsed = parseClaudeTranscript(text, { fallbackStartedAt });
    return toRows(parsed, path);
}
