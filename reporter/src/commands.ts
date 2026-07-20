import {
    claudeEmbeddedSessionId,
    claudeSessionIdFromPath,
    claudeSessionSiblings,
    collectClaudeSessionRows,
} from './agents/claude-sessions';
import {
    CODEX_ROLLOUT_FILE,
    codexDirs,
    dedupeCodexRolloutFiles,
    seedCodexRolloutIndex,
} from './agents/codex';
import {
    cursorFetchEvents,
    cursorSessionToken,
    parseCursorEvents,
} from './agents/cursor';
import {
    collectOpencodeRows,
    reportOneOpencodeSession,
} from './agents/opencode';
import { piDirs } from './agents/pi';
import { postSessions, readStdin } from './api';
import { collectRowsFromJsonlDirs } from './lib/collect';
import { CATCHUP_DAYS, HISTORY_CHUNK } from './lib/flags';
import { walkJsonl } from './lib/fs-walk';
import type {
    JsonObject,
    PostOpts,
    ReporterConfig,
    ReporterRow,
} from './lib/types';
import { parseFile } from './parse-file';

interface CursorSyncOpts {
    sinceMs?: number;
    post?: PostOpts;
}

async function catchupJsonlSource(
    cfg: ReporterConfig,
    source: string,
    dirs: string[],
    match: (name: string) => boolean,
    label: string,
): Promise<void> {
    const since = Date.now() - CATCHUP_DAYS * 86_400_000;
    const { files, rows } = collectRowsFromJsonlDirs({
        dirs,
        sinceMs: since,
        match,
        parseFile: (path) => parseFile(path, source),
    });
    const { accepted } = await postSessions(cfg, source, rows);
    process.stderr.write(
        `tokenmaxer: caught up ${accepted} ${label}row(s) from ${files.length} file(s)\n`,
    );
}

export async function claudeSessionEnd(cfg: ReporterConfig): Promise<void> {
    const stdin = await readStdin();
    let hook: JsonObject = {};
    try {
        const parsed: unknown = JSON.parse(stdin);
        if (parsed !== null && typeof parsed === 'object') {
            hook = parsed as JsonObject;
        }
    } catch {
        /* no hook payload */
    }
    const path = hook.transcript_path;
    // fall back to a scan when no transcript path is provided
    if (typeof path !== 'string' || !path) return claudeCatchup(cfg);
    const hookSid =
        typeof hook.session_id === 'string' && hook.session_id
            ? hook.session_id
            : undefined;
    // Run the whole-session collector seeded with the hooked transcript's
    // sibling files (which may live outside the walked corpus). Rows key on
    // embedded session ids — the hook id only fills in when a transcript
    // declares none — so every uploaded row is a complete session total,
    // never a partial that the server's replace-upsert would use to erase a
    // fuller row. A listing failure inside the hooked session's own tree
    // withholds the hooked session for the same reason.
    const failedSiblingDirs: string[] = [];
    const siblings = claudeSessionSiblings(path, failedSiblingDirs);
    const extraFailedSids: string[] = [];
    if (failedSiblingDirs.length > 0) {
        extraFailedSids.push(
            claudeEmbeddedSessionId(path) ??
                hookSid ??
                claudeSessionIdFromPath(path),
        );
    }
    const since = Date.now() - CATCHUP_DAYS * 86_400_000;
    const { rows, sessionCount } = collectClaudeSessionRows(
        since,
        siblings,
        hookSid,
        extraFailedSids,
    );
    const { accepted } = await postSessions(cfg, 'claude_code', rows);
    process.stderr.write(
        `tokenmaxer: reported ${accepted} row(s) across ${sessionCount} session(s)\n`,
    );
}

export async function claudeCatchup(cfg: ReporterConfig): Promise<void> {
    const since = Date.now() - CATCHUP_DAYS * 86_400_000;
    const { rows, fileCount, sessionCount } = collectClaudeSessionRows(since);
    const { accepted } = await postSessions(cfg, 'claude_code', rows);
    process.stderr.write(
        `tokenmaxer: caught up ${accepted} row(s) across ${sessionCount} session(s) from ${fileCount} file(s)\n`,
    );
}

export async function codexCatchup(cfg: ReporterConfig): Promise<void> {
    const since = Date.now() - CATCHUP_DAYS * 86_400_000;
    // Dedupe copies of one session across sessions/ and archived_sessions/
    // before parsing — the server upsert replaces, so a stale copy's row
    // must never race the fuller one.
    const files = dedupeCodexRolloutFiles(
        codexDirs().flatMap((d) =>
            walkJsonl(d, since, (n) => CODEX_ROLLOUT_FILE.test(n)),
        ),
    );
    const rows: ReporterRow[] = [];
    for (const file of files) {
        try {
            rows.push(...parseFile(file, 'codex'));
        } catch {
            /* skip unreadable / unparseable file */
        }
    }
    const { accepted } = await postSessions(cfg, 'codex', rows);
    process.stderr.write(
        `tokenmaxer: caught up ${accepted} row(s) from ${files.length} file(s)\n`,
    );
}

export async function opencodeCatchup(cfg: ReporterConfig): Promise<void> {
    const since = Date.now() - CATCHUP_DAYS * 86_400_000;
    const rows = collectOpencodeRows(since);
    const { accepted } = await postSessions(cfg, 'opencode', rows);
    process.stderr.write(`tokenmaxer: caught up ${accepted} opencode row(s)\n`);
}

export async function piCatchup(cfg: ReporterConfig): Promise<void> {
    await catchupJsonlSource(
        cfg,
        'pi',
        piDirs(),
        (n) => n.endsWith('.jsonl'),
        'pi ',
    );
}

export async function reportOneOpencode(
    cfg: ReporterConfig,
    sessionArg: string | undefined,
): Promise<void> {
    if (!sessionArg) {
        process.stderr.write('tokenmaxer: missing opencode session id\n');
        return;
    }
    const rows = reportOneOpencodeSession(sessionArg);
    const { accepted } = await postSessions(cfg, 'opencode', rows);
    process.stderr.write(`tokenmaxer: reported ${accepted} opencode row(s)\n`);
}

export async function cursorSync(
    cfg: ReporterConfig,
    opts: CursorSyncOpts = {},
): Promise<number> {
    const sessionToken = cursorSessionToken(cfg);
    if (!sessionToken) {
        process.stderr.write(
            'tokenmaxer: Cursor not configured (no state.vscdb token or cursorCookie)\n',
        );
        return 0;
    }
    const since = opts.sinceMs ?? Date.now() - CATCHUP_DAYS * 86_400_000;
    // Floor to UTC day start: rows are whole-day sums and the server upsert
    // replaces counts, so a partial oldest day would shrink stored totals.
    const d = new Date(since);
    const sinceMs = Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
    );
    const events = await cursorFetchEvents(sessionToken, sinceMs);
    if (events === null) {
        process.stderr.write(
            'tokenmaxer: cursor sync aborted (fetch failed)\n',
        );
        return 1;
    }
    const rows = parseCursorEvents(events);
    const result = await postSessions(cfg, 'cursor', rows, opts.post);
    process.stderr.write(
        `tokenmaxer: cursor synced ${result.accepted} row(s) from ${events.length} event(s)\n`,
    );
    return result.rejected + result.failed;
}

async function backfillFiles(
    cfg: ReporterConfig,
    source: string,
    rows: ReporterRow[],
    label: string,
    fileCount: number,
): Promise<{ accepted: number; problems: number }> {
    const result = await postSessions(cfg, source, rows, {
        path: '/api/history',
        chunkSize: HISTORY_CHUNK,
    });
    process.stderr.write(
        `tokenmaxer: backfilled ${result.accepted} ${label} row(s) from ${fileCount} file(s)\n`,
    );
    return {
        accepted: result.accepted,
        problems: result.rejected + result.failed,
    };
}

export async function backfill(
    cfg: ReporterConfig,
    only: string | undefined,
): Promise<void> {
    let total = 0;
    let problems = 0;
    if (!only || only === 'claude') {
        const { rows, fileCount } = collectClaudeSessionRows(0);
        const r = await backfillFiles(
            cfg,
            'claude_code',
            rows,
            'Claude Code',
            fileCount,
        );
        total += r.accepted;
        problems += r.problems;
    }
    if (!only || only === 'codex') {
        const files = dedupeCodexRolloutFiles(
            codexDirs().flatMap((d) =>
                walkJsonl(d, 0, (n) => CODEX_ROLLOUT_FILE.test(n)),
            ),
        );
        // Seed before parse: parent lookups for subagent/fork children
        // reuse this walk instead of paying for a second one.
        seedCodexRolloutIndex(files);
        const rows = files.flatMap((f) => {
            try {
                return parseFile(f, 'codex');
            } catch {
                return [];
            }
        });
        const r = await backfillFiles(
            cfg,
            'codex',
            rows,
            'Codex',
            files.length,
        );
        total += r.accepted;
        problems += r.problems;
    }
    if (!only || only === 'opencode') {
        const rows = collectOpencodeRows(0);
        const result = await postSessions(cfg, 'opencode', rows, {
            path: '/api/history',
            chunkSize: HISTORY_CHUNK,
        });
        total += result.accepted;
        problems += result.rejected + result.failed;
        process.stderr.write(
            `tokenmaxer: backfilled ${result.accepted} opencode row(s)\n`,
        );
    }
    if (!only || only === 'pi') {
        const { files, rows } = collectRowsFromJsonlDirs({
            dirs: piDirs(),
            sinceMs: 0,
            match: (n) => n.endsWith('.jsonl'),
            parseFile: (path) => parseFile(path, 'pi'),
        });
        const r = await backfillFiles(cfg, 'pi', rows, 'pi', files.length);
        total += r.accepted;
        problems += r.problems;
    }
    if (!only || only === 'cursor') {
        problems += await cursorSync(cfg, {
            sinceMs: Date.now() - 90 * 86_400_000,
            post: { path: '/api/history', chunkSize: HISTORY_CHUNK },
        });
    }
    if (problems > 0) {
        // A partial upload must not masquerade as success: report what was
        // lost and exit non-zero so scripts and humans notice.
        process.stderr.write(
            `tokenmaxer: backfill finished with errors — ${total} row(s) stored, ${problems} row(s) rejected or failed\n`,
        );
        process.exitCode = 1;
        return;
    }
    process.stderr.write(
        `tokenmaxer: backfill complete — ${total} row(s) total\n`,
    );
}

export async function reportOne(
    cfg: ReporterConfig,
    path: string | undefined,
    source: string,
): Promise<void> {
    if (!path) {
        process.stderr.write(`tokenmaxer: missing path for ${source} report\n`);
        return;
    }
    const rows = parseFile(path, source);
    const { accepted } = await postSessions(cfg, source, rows);
    process.stderr.write(`tokenmaxer: reported ${accepted} row(s)\n`);
}
