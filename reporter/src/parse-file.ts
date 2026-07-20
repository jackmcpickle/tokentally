import { readFileSync, statSync } from 'node:fs';
import { parseClaudeTranscript } from './agents/claude';
import {
    codexParentSequenceById,
    parseCodexRollout,
    resolveCodexInherited,
} from './agents/codex';
import { parsePiRollout } from './agents/pi';
import { toRows } from './lib/rows';
import type {
    ParsedCodexRollout,
    ParsedTranscript,
    ReporterRow,
} from './lib/types';

export function parseFile(path: string, source: string): ReporterRow[] {
    const text = readFileSync(path, 'utf8');
    let fallbackStartedAt: number | null = null;
    try {
        fallbackStartedAt = statSync(path).mtimeMs;
    } catch {
        /* ignore */
    }
    let parsed: ParsedTranscript | ParsedCodexRollout;
    if (source === 'codex') {
        const codexParsed = parseCodexRollout(text, { fallbackStartedAt });
        if (codexParsed.pending_inherited.length > 0) {
            // A session naming itself as parent is bogus metadata — treat
            // as parent-not-found (count everything) rather than matching
            // the child against its own history.
            const selfParent =
                typeof codexParsed.session_id === 'string' &&
                codexParsed.parent_id?.toLowerCase() ===
                    codexParsed.session_id.toLowerCase();
            resolveCodexInherited(
                codexParsed,
                selfParent
                    ? null
                    : codexParentSequenceById(codexParsed.parent_id, path),
            );
        }
        parsed = codexParsed;
    } else if (source === 'pi')
        parsed = parsePiRollout(text, { fallbackStartedAt });
    else parsed = parseClaudeTranscript(text, { fallbackStartedAt });
    return toRows(parsed, path);
}
