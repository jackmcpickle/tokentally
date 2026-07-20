#!/usr/bin/env node
// tokenmaxer reporter — TypeScript modules bundled to a zero-dependency .mjs.
//
// Reads Claude Code / Codex session transcripts, sums token usage per model, and
// POSTs cumulative per-session totals to the tokenmaxer.quest API. Reporting is
// idempotent (keyed by session id), so running it on SessionStart and SessionEnd
// can never double-count.
//
// What leaves the machine: per-session token counts, model names, session ids,
// and timestamps — never prompts, code, file paths, or credentials. Append
// --dry-run to any command to print the exact payloads instead of sending them.
// The Cursor session cookie (when used) is sent only to cursor.com.
//
// Config: ~/.tokenmaxer/config.json  =>  { "apiBase": "https://...", "token": "tt_..." }
// (env TOKENMAXER_API_BASE / TOKENMAXER_TOKEN override the file.)
// Legacy fallbacks: ~/.tokentally/config.json and TOKENTALLY_* env vars.

// cli → commands → flags: --dry-run is stripped during module init.
import { invokedDirectlyAs, main } from './cli';

export { parseClaudeTranscript } from './agents/claude';
export {
    codexForkResolverFor,
    dedupeCodexRolloutFiles,
    parseCodexRollout,
} from './agents/codex';
export { parseCursorEvents } from './agents/cursor';
export { parseOpencodeMessages } from './agents/opencode';
export { parsePiRollout } from './agents/pi';
export { loadConfig } from './config';
export { sessionIdFromPath, toRows } from './lib/rows';
export {
    buildProfileUrlBody,
    buildProfileUrlDryRun,
    parseSetProfileUrlArgs,
} from './profile';

if (invokedDirectlyAs(process.argv[1])) {
    main().catch((err: unknown) => {
        // Never break the host session — hooks must exit cleanly.
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`tokenmaxer: ${message}\n`);
        process.exit(0);
    });
}
