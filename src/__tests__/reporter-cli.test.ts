import { spawnSync } from 'node:child_process';
import {
    chmodSync,
    mkdtempSync,
    mkdirSync,
    rmSync,
    symlinkSync,
    utimesSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const REPORTER = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../reporter/tokentally.mjs',
);

const CLAUDE = [
    JSON.stringify({
        type: 'user',
        timestamp: '2026-07-18T10:00:00Z',
        sessionId: 'sess-cli',
    }),
    JSON.stringify({
        type: 'assistant',
        timestamp: '2026-07-18T10:00:05Z',
        sessionId: 'sess-cli',
        message: {
            model: 'claude-opus-4-8-20260101',
            usage: {
                input_tokens: 100,
                output_tokens: 200,
                cache_read_input_tokens: 50,
                cache_creation_input_tokens: 5,
            },
        },
    }),
].join('\n');

const CODEX = [
    JSON.stringify({
        type: 'session_meta',
        timestamp: '2026-07-18T09:00:00Z',
        payload: { id: 'codex-cli', model: 'gpt-5-codex' },
    }),
    JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-07-18T09:00:10Z',
        payload: {
            type: 'token_count',
            info: {
                last_token_usage: {
                    input_tokens: 40,
                    output_tokens: 20,
                    cached_input_tokens: 0,
                    cache_write_input_tokens: 0,
                    reasoning_output_tokens: 0,
                },
            },
        },
    }),
].join('\n');

const PI = [
    JSON.stringify({
        type: 'session',
        id: 'rec_0',
        sessionId: 'pi-cli',
        timestamp: '2026-07-18T07:00:00Z',
        model: 'kimi-k2',
    }),
    JSON.stringify({
        type: 'assistant',
        id: 'rec_1',
        model: 'kimi-k2',
        usage: { input: 12, output: 8, cacheRead: 0, cacheWrite: 0 },
    }),
].join('\n');

/** Dry-run payloads are pretty-printed JSON objects separated by newlines. */
function parseDryRunPayloads(stdout: string): Array<{
    dryRun: boolean;
    url: string;
    body: { source: string; sessions: unknown[] };
}> {
    const trimmed = stdout.trim();
    if (!trimmed) return [];
    const chunks = trimmed.split(/\n(?=\{\n {2}"dryRun": true)/u);
    return chunks.map((chunk) => JSON.parse(chunk));
}

function runCli(
    args: string[],
    opts: {
        home: string;
        stdin?: string;
        env?: Record<string, string | undefined>;
    },
) {
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: opts.home };
    // Drop config env so the temp HOME config (or its absence) is authoritative.
    for (const key of [
        'TOKENMAXER_API_BASE',
        'TOKENMAXER_TOKEN',
        'TOKENMAXER_DAYS',
        'TOKENTALLY_API_BASE',
        'TOKENTALLY_TOKEN',
        'TOKENTALLY_DAYS',
        'OPENCODE_DATA_DIR',
        'XDG_DATA_HOME',
        'PI_CODING_AGENT_SESSION_DIR',
        'PI_AGENT_DIR',
    ]) {
        Reflect.deleteProperty(env, key);
    }
    if (opts.env) {
        for (const [key, value] of Object.entries(opts.env)) {
            if (value === undefined) Reflect.deleteProperty(env, key);
            else env[key] = value;
        }
    }
    return spawnSync(process.execPath, [REPORTER, ...args], {
        encoding: 'utf8',
        env,
        input: opts.stdin,
        timeout: 15_000,
    });
}

describe('tokenmaxer CLI', () => {
    let home: string;

    beforeEach(() => {
        home = mkdtempSync(join(tmpdir(), 'tokenmaxer-cli-'));
    });

    afterEach(() => {
        rmSync(home, { recursive: true, force: true });
    });

    function writeConfig(
        data: object = {
            apiBase: 'https://tokenmaxer.quest',
            token: 'tt_test',
        },
    ) {
        const dir = join(home, '.tokenmaxer');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'config.json'), JSON.stringify(data));
    }

    function writeTranscript(relPath: string, body: string): string {
        const path = join(home, relPath);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, body);
        return path;
    }

    it('prints usage for unknown commands and exits 0', () => {
        writeConfig();
        const res = runCli(['not-a-command'], { home });
        expect(res.status).toBe(0);
        expect(res.stderr).toContain('usage: tokenmaxer');
        expect(res.stderr).toContain('backfill');
    });

    it('exits cleanly with a tokenmaxer config error when unconfigured', () => {
        const res = runCli(['claude-sessionstart'], { home });
        expect(res.status).toBe(0);
        expect(res.stderr).toMatch(
            /tokenmaxer not configured.*~\/\.tokenmaxer/u,
        );
    });

    it('claude-report --dry-run prints the ingest payload', () => {
        writeConfig();
        const path = writeTranscript('sess-cli.jsonl', CLAUDE);
        const res = runCli(['claude-report', path, '--dry-run'], { home });
        expect(res.status).toBe(0);
        expect(res.stderr).toContain('tokenmaxer: reported');
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.dryRun).toBe(true);
        expect(payload.url).toBe('https://tokenmaxer.quest/api/ingest');
        expect(payload.body.source).toBe('claude_code');
        expect(payload.body.sessions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    session_id: 'sess-cli',
                    model: 'claude-opus-4-8-20260101',
                    input_tokens: 100,
                    output_tokens: 200,
                }),
            ]),
        );
    });

    it('codex-report --dry-run prints codex sessions', () => {
        writeConfig();
        const path = writeTranscript(
            '.codex/sessions/2026/07/18/rollout-codex-cli.jsonl',
            CODEX,
        );
        const res = runCli(['codex-report', path, '--dry-run'], { home });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.body.source).toBe('codex');
        expect(payload.body.sessions[0]).toMatchObject({
            session_id: 'codex-cli',
            model: 'gpt-5-codex',
            input_tokens: 40,
            output_tokens: 20,
        });
    });

    it('pi-report --dry-run prints pi sessions', () => {
        writeConfig();
        const path = writeTranscript(
            '.pi/agent/sessions/proj/pi-cli.jsonl',
            PI,
        );
        const res = runCli(['pi-report', path, '--dry-run'], { home });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.body.source).toBe('pi');
        expect(payload.body.sessions[0]).toMatchObject({
            session_id: 'pi-cli',
            model: 'kimi-k2',
            input_tokens: 12,
            output_tokens: 8,
        });
    });

    it('claude-sessionend --dry-run reads transcript_path from stdin', () => {
        writeConfig();
        const path = writeTranscript(
            '.claude/projects/demo/sess-cli.jsonl',
            CLAUDE,
        );
        const res = runCli(['claude-sessionend', '--dry-run'], {
            home,
            stdin: JSON.stringify({
                transcript_path: path,
                session_id: 'sess-cli',
            }),
        });
        expect(res.status).toBe(0);
        expect(res.stderr).toContain(
            'tokenmaxer: reported 1 row(s) across 1 session(s)',
        );
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.body.source).toBe('claude_code');
        expect(payload.body.sessions[0]?.session_id).toBe('sess-cli');
    });

    it('claude-sessionstart --dry-run catches up recent Claude transcripts', () => {
        writeConfig();
        writeTranscript('.claude/projects/demo/sess-cli.jsonl', CLAUDE);
        const res = runCli(['claude-sessionstart', '--dry-run'], { home });
        expect(res.status).toBe(0);
        expect(res.stderr).toMatch(
            /tokenmaxer: caught up 1 row\(s\) across 1 session\(s\) from 1 file\(s\)/u,
        );
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.url).toBe('https://tokenmaxer.quest/api/ingest');
        expect(payload.body.sessions[0]?.session_id).toBe('sess-cli');
    });

    it('codex-sessionstart --dry-run catches up recent Codex rollouts', () => {
        writeConfig();
        writeTranscript(
            '.codex/sessions/2026/07/18/rollout-codex-cli.jsonl',
            CODEX,
        );
        const res = runCli(['codex-sessionstart', '--dry-run'], { home });
        expect(res.status).toBe(0);
        expect(res.stderr).toContain('tokenmaxer: caught up');
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.body.source).toBe('codex');
        expect(payload.body.sessions[0]?.session_id).toBe('codex-cli');
    });

    it('backfill --dry-run posts history payloads and completes', () => {
        writeConfig();
        writeTranscript('.claude/projects/demo/sess-cli.jsonl', CLAUDE);
        writeTranscript(
            '.codex/sessions/2026/07/18/rollout-codex-cli.jsonl',
            CODEX,
        );
        writeTranscript('.pi/agent/sessions/proj/pi-cli.jsonl', PI);
        const res = runCli(['backfill', '--dry-run'], { home });
        expect(res.status).toBe(0);
        expect(res.stderr).toContain('tokenmaxer: backfill complete');
        const payloads = parseDryRunPayloads(res.stdout);
        expect(payloads.length).toBeGreaterThanOrEqual(3);
        expect(
            payloads.every((p) => String(p.url).endsWith('/api/history')),
        ).toBe(true);
        const sources = new Set(payloads.map((p) => p.body.source));
        expect(sources.has('claude_code')).toBe(true);
        expect(sources.has('codex')).toBe(true);
        expect(sources.has('pi')).toBe(true);
    });

    it('backfill claude --dry-run scopes to Claude only', () => {
        writeConfig();
        writeTranscript('.claude/projects/demo/sess-cli.jsonl', CLAUDE);
        writeTranscript(
            '.codex/sessions/2026/07/18/rollout-codex-cli.jsonl',
            CODEX,
        );
        const res = runCli(['backfill', 'claude', '--dry-run'], { home });
        expect(res.status).toBe(0);
        const payloads = parseDryRunPayloads(res.stdout);
        expect(payloads).toHaveLength(1);
        expect(payloads[0]?.body.source).toBe('claude_code');
        expect(payloads[0]?.url).toContain('/api/history');
    });

    it('prefers TOKENMAXER_* env over config file in CLI dry-run', () => {
        writeConfig({
            apiBase: 'https://file.example',
            token: 'tt_file',
        });
        const path = writeTranscript('sess-cli.jsonl', CLAUDE);
        const res = runCli(['claude-report', path, '--dry-run'], {
            home,
            env: {
                TOKENMAXER_API_BASE: 'https://env.example',
                TOKENMAXER_TOKEN: 'tt_env',
            },
        });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.url).toBe('https://env.example/api/ingest');
    });

    it('cursor-sync exits cleanly when Cursor auth is missing', () => {
        writeConfig();
        const res = runCli(['cursor-sync', '--dry-run'], { home });
        expect(res.status).toBe(0);
        expect(res.stderr).toContain('tokenmaxer: Cursor not configured');
    });

    // ---- Claude multi-file session aggregation ----------------------------

    function claudeUsage(opts: {
        sid?: string;
        messageId?: string;
        input?: number;
        output?: number;
        ts?: string;
    }): string {
        return JSON.stringify({
            type: 'assistant',
            timestamp: opts.ts ?? '2026-07-18T10:02:00Z',
            ...(opts.sid ? { sessionId: opts.sid } : {}),
            message: {
                ...(opts.messageId ? { id: opts.messageId } : {}),
                model: 'claude-opus-4-8-20260101',
                usage: {
                    input_tokens: opts.input ?? 0,
                    output_tokens: opts.output ?? 0,
                },
            },
        });
    }

    it('claude-sessionstart merges subagent transcripts into one row', () => {
        writeConfig();
        writeTranscript('.claude/projects/demo/sess-cli.jsonl', CLAUDE);
        writeTranscript(
            '.claude/projects/demo/sess-cli/subagents/workflows/wf-1/agent-a.jsonl',
            claudeUsage({ sid: 'sess-cli', input: 7, output: 3 }),
        );
        const res = runCli(['claude-sessionstart', '--dry-run'], { home });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.body.sessions).toHaveLength(1);
        expect(payload.body.sessions[0]).toMatchObject({
            session_id: 'sess-cli',
            input_tokens: 107,
            output_tokens: 203,
        });
    });

    it('claude-sessionstart includes stale files of sessions with recent activity', () => {
        writeConfig();
        // Root transcript last modified WAY outside the catch-up window…
        const root = writeTranscript(
            '.claude/projects/demo/sess-cli.jsonl',
            CLAUDE,
        );
        const old = (Date.now() - 30 * 86_400_000) / 1000;
        utimesSync(root, old, old);
        // …but a subagent transcript of the same session changed just now.
        writeTranscript(
            '.claude/projects/demo/sess-cli/subagents/agent-a.jsonl',
            claudeUsage({ sid: 'sess-cli', input: 7, output: 3 }),
        );
        const res = runCli(['claude-sessionstart', '--dry-run'], { home });
        expect(res.status).toBe(0);
        // The stale root must still be included, or the aggregated row would
        // hold only the subagent's partial total.
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.body.sessions).toHaveLength(1);
        expect(payload.body.sessions[0]).toMatchObject({
            session_id: 'sess-cli',
            input_tokens: 107,
            output_tokens: 203,
        });
    });

    it('claude-sessionstart counts a mismatched-filename copy once, any order', () => {
        writeConfig();
        // Same keyed message recorded in the canonical file and in a copy
        // whose FILENAME doesn't match the embedded session id. Grouping
        // keys on the embedded id, so the chunks dedupe last-wins across
        // both files regardless of iteration order.
        const keyed = claudeUsage({
            sid: 'sess-keyed',
            messageId: 'msg_1',
            input: 100,
            output: 10,
        });
        for (const copyName of ['zz-copy.jsonl', 'aa-copy.jsonl']) {
            writeTranscript('.claude/projects/demo/sess-keyed.jsonl', keyed);
            writeTranscript(`.claude/projects/demo/${copyName}`, keyed);
            const res = runCli(['claude-sessionstart', '--dry-run'], { home });
            expect(res.status).toBe(0);
            const payload = JSON.parse(res.stdout.trim());
            expect(payload.body.sessions).toHaveLength(1);
            expect(payload.body.sessions[0]).toMatchObject({
                session_id: 'sess-keyed',
                input_tokens: 100,
            });
            rmSync(join(home, '.claude/projects/demo', copyName));
        }
    });

    it('claude-sessionstart includes a stale mismatched-filename copy of a recent session', () => {
        writeConfig();
        writeTranscript('.claude/projects/demo/sess-cli.jsonl', CLAUDE);
        // A copy carrying EXTRA old activity for the same embedded session,
        // last modified far outside the window.
        const copy = writeTranscript(
            '.claude/projects/demo/old-copy.jsonl',
            claudeUsage({
                sid: 'sess-cli',
                messageId: 'msg_old',
                input: 11,
                output: 2,
                ts: '2026-07-01T09:00:00Z',
            }),
        );
        const old = (Date.now() - 30 * 86_400_000) / 1000;
        utimesSync(copy, old, old);
        const res = runCli(['claude-sessionstart', '--dry-run'], { home });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.body.sessions).toHaveLength(1);
        // The uploaded row must be the COMPLETE session total, or the
        // replace-upsert would erase the old activity from the server.
        expect(payload.body.sessions[0]).toMatchObject({
            session_id: 'sess-cli',
            input_tokens: 111,
            output_tokens: 202,
        });
    });

    it('claude-sessionstart folds in a copy whose id sits beyond the peek window', () => {
        writeConfig();
        writeTranscript('.claude/projects/demo/sess-cli.jsonl', CLAUDE);
        // A mismatched-filename copy whose embedded session id first appears
        // past the 16KB peek window: grouping falls back to the path-derived
        // id, but the scan still resolves the events to sess-cli.
        const filler = Array.from({ length: 1200 }, () =>
            JSON.stringify({ type: 'progress' }),
        );
        writeTranscript(
            '.claude/projects/demo/late-copy.jsonl',
            [
                ...filler,
                claudeUsage({
                    sid: 'sess-cli',
                    messageId: 'msg_late',
                    input: 5,
                    output: 1,
                    ts: '2026-07-18T10:03:00Z',
                }),
            ].join('\n'),
        );
        const res = runCli(['claude-sessionstart', '--dry-run'], { home });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.body.sessions).toHaveLength(1);
        expect(payload.body.sessions[0]).toMatchObject({
            session_id: 'sess-cli',
            input_tokens: 105,
            output_tokens: 201,
        });
    });

    it('claude-sessionstart survives corrupted transcripts', () => {
        writeConfig();
        writeTranscript('.claude/projects/demo/sess-cli.jsonl', CLAUDE);
        writeTranscript(
            '.claude/projects/demo/sess-bad.jsonl',
            'null\n{"trunc',
        );
        const res = runCli(['claude-sessionstart', '--dry-run'], { home });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.body.sessions).toHaveLength(1);
        expect(payload.body.sessions[0]?.session_id).toBe('sess-cli');
    });

    it('claude-sessionstart follows a symlinked session directory', () => {
        writeConfig();
        writeTranscript('.claude/projects/demo/sess-cli.jsonl', CLAUDE);
        // Subagent tree lives elsewhere; the session dir is a symlink to it.
        const realDir = join(home, 'elsewhere', 'sess-cli-data');
        mkdirSync(join(realDir, 'subagents'), { recursive: true });
        writeFileSync(
            join(realDir, 'subagents', 'agent-a.jsonl'),
            claudeUsage({ sid: 'sess-cli', input: 9, output: 1 }),
        );
        symlinkSync(realDir, join(home, '.claude/projects/demo/sess-cli'));
        const res = runCli(['claude-sessionstart', '--dry-run'], { home });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.body.sessions).toHaveLength(1);
        expect(payload.body.sessions[0]).toMatchObject({
            session_id: 'sess-cli',
            input_tokens: 109,
        });
    });

    it('claude-sessionstart terminates on a symlink cycle in a session tree', () => {
        writeConfig();
        writeTranscript('.claude/projects/demo/sess-cli.jsonl', CLAUDE);
        const sessionDir = join(home, '.claude/projects/demo/sess-cli');
        mkdirSync(join(sessionDir, 'subagents'), { recursive: true });
        // Symlink pointing back at an ancestor — the walk must not loop.
        symlinkSync(sessionDir, join(sessionDir, 'subagents', 'loop'));
        const res = runCli(['claude-sessionstart', '--dry-run'], { home });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.body.sessions).toHaveLength(1);
        expect(payload.body.sessions[0]).toMatchObject({
            session_id: 'sess-cli',
            input_tokens: 100,
        });
    });

    it('codex-sessionstart does not follow symlinked directories', () => {
        writeConfig();
        writeTranscript(
            '.codex/sessions/2026/07/18/rollout-codex-cli.jsonl',
            CODEX,
        );
        // A rollout only reachable through a symlink must stay invisible —
        // codex traversal keeps its never-follow behaviour.
        writeTranscript(
            'outside/rollout-codex-linked.jsonl',
            CODEX.replace('codex-cli', 'codex-linked'),
        );
        symlinkSync(
            join(home, 'outside'),
            join(home, '.codex/sessions/2026/linked'),
        );
        const res = runCli(['codex-sessionstart', '--dry-run'], { home });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        const ids = payload.body.sessions.map(
            (s: { session_id: string }) => s.session_id,
        );
        expect(ids).toContain('codex-cli');
        expect(ids).not.toContain('codex-linked');
    });

    it.skipIf(userInfo().uid === 0)(
        'claude-sessionstart withholds sessions with unreadable files',
        () => {
            writeConfig();
            writeTranscript('.claude/projects/demo/sess-cli.jsonl', CLAUDE);
            const bad = writeTranscript(
                '.claude/projects/demo/sess-locked.jsonl',
                claudeUsage({ sid: 'sess-locked', input: 50, output: 5 }),
            );
            chmodSync(bad, 0o000);
            try {
                const res = runCli(['claude-sessionstart', '--dry-run'], {
                    home,
                });
                expect(res.status).toBe(0);
                const payload = JSON.parse(res.stdout.trim());
                const ids = payload.body.sessions.map(
                    (s: { session_id: string }) => s.session_id,
                );
                expect(ids).toContain('sess-cli');
                // Uploading nothing for the unreadable session leaves its
                // existing server row intact; a partial row would replace it.
                expect(ids).not.toContain('sess-locked');
            } finally {
                chmodSync(bad, 0o644);
            }
        },
    );

    it.skipIf(userInfo().uid === 0)(
        'claude-sessionstart withholds a session whose subagents dir is unlistable',
        () => {
            writeConfig();
            writeTranscript('.claude/projects/demo/sess-cli.jsonl', CLAUDE);
            // Root file embeds a DIFFERENT id than the dir layout name, and
            // its name casing differs too — withholding must cover the
            // embedded id across both mismatches.
            writeTranscript(
                '.claude/projects/demo/SESS-DARK.jsonl',
                claudeUsage({ sid: 'sess-embedded-x', input: 40, output: 4 }),
            );
            const darkDir = join(
                home,
                '.claude/projects/demo/sess-dark/subagents',
            );
            mkdirSync(darkDir, { recursive: true });
            chmodSync(darkDir, 0o000);
            try {
                const res = runCli(['claude-sessionstart', '--dry-run'], {
                    home,
                });
                expect(res.status).toBe(0);
                const payload = JSON.parse(res.stdout.trim());
                const ids = payload.body.sessions.map(
                    (s: { session_id: string }) => s.session_id,
                );
                expect(ids).toContain('sess-cli');
                expect(ids).not.toContain('sess-embedded-x');
            } finally {
                chmodSync(darkDir, 0o755);
            }
        },
    );

    it('claude-sessionend reports subagent siblings with the root transcript', () => {
        writeConfig();
        const path = writeTranscript(
            '.claude/projects/demo/sess-cli.jsonl',
            CLAUDE,
        );
        writeTranscript(
            '.claude/projects/demo/sess-cli/subagents/workflows/wf-1/agent-a.jsonl',
            claudeUsage({ sid: 'sess-cli', input: 7, output: 3 }),
        );
        const res = runCli(['claude-sessionend', '--dry-run'], {
            home,
            stdin: JSON.stringify({
                transcript_path: path,
                session_id: 'sess-cli',
            }),
        });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.body.sessions).toHaveLength(1);
        expect(payload.body.sessions[0]).toMatchObject({
            session_id: 'sess-cli',
            input_tokens: 107,
            output_tokens: 203,
        });
    });

    it('claude-sessionend completes a foreign session found in the hooked tree', () => {
        writeConfig();
        const path = writeTranscript(
            '.claude/projects/demo/sess-cli.jsonl',
            CLAUDE,
        );
        const fragment = claudeUsage({
            sid: 'sess-b',
            messageId: 'msg_b1',
            input: 5,
            output: 1,
            ts: '2026-07-18T09:00:00Z',
        });
        // A copied fragment of session B inside the hooked session's tree…
        writeTranscript(
            '.claude/projects/demo/sess-cli/subagents/agent-x.jsonl',
            fragment,
        );
        // …while B's own complete transcript (a superset) sits elsewhere,
        // last modified outside the catch-up window.
        const bFull = writeTranscript(
            '.claude/projects/demo/sess-b.jsonl',
            [
                fragment,
                claudeUsage({
                    sid: 'sess-b',
                    messageId: 'msg_b2',
                    input: 95,
                    output: 9,
                    ts: '2026-07-18T09:01:00Z',
                }),
            ].join('\n'),
        );
        const old = (Date.now() - 30 * 86_400_000) / 1000;
        utimesSync(bFull, old, old);
        const res = runCli(['claude-sessionend', '--dry-run'], {
            home,
            stdin: JSON.stringify({
                transcript_path: path,
                session_id: 'sess-cli',
            }),
        });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        const byId = new Map(
            payload.body.sessions.map((s: { session_id: string }) => [
                s.session_id,
                s,
            ]),
        );
        expect(byId.get('sess-cli')).toMatchObject({ input_tokens: 100 });
        // Session B must be posted COMPLETE (fragment deduped against its own
        // transcript), never as a 5-token partial that would replace B's row.
        expect(byId.get('sess-b')).toMatchObject({
            input_tokens: 100,
            output_tokens: 10,
        });
    });

    it('claude-sessionend keys rows by the embedded id when the hook id differs', () => {
        writeConfig();
        const path = writeTranscript(
            '.claude/projects/demo/sess-cli.jsonl',
            CLAUDE,
        );
        const res = runCli(['claude-sessionend', '--dry-run'], {
            home,
            stdin: JSON.stringify({
                transcript_path: path,
                session_id: 'sess-other',
            }),
        });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        // The transcript declares sess-cli; a mismatched hook id must not
        // split the session into partial rows under two different ids.
        expect(payload.body.sessions).toHaveLength(1);
        expect(payload.body.sessions[0]).toMatchObject({
            session_id: 'sess-cli',
            input_tokens: 100,
        });
    });

    it('claude-sessionend falls back to catch-up on null or non-string hook payloads', () => {
        writeConfig();
        writeTranscript('.claude/projects/demo/sess-cli.jsonl', CLAUDE);
        for (const stdin of ['null', JSON.stringify({ transcript_path: 42 })]) {
            const res = runCli(['claude-sessionend', '--dry-run'], {
                home,
                stdin,
            });
            expect(res.status).toBe(0);
            expect(res.stderr).toContain('tokenmaxer: caught up');
        }
    });

    it('claude-sessionend treats an empty hook session_id as absent', () => {
        writeConfig();
        // Transcript with no embedded sessionId; hook sends session_id: "".
        const path = writeTranscript(
            '.claude/projects/demo/sess-bare.jsonl',
            claudeUsage({ input: 9, output: 4 }),
        );
        const res = runCli(['claude-sessionend', '--dry-run'], {
            home,
            stdin: JSON.stringify({ transcript_path: path, session_id: '' }),
        });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.body.sessions).toHaveLength(1);
        expect(payload.body.sessions[0]).toMatchObject({
            session_id: 'sess-bare',
            input_tokens: 9,
        });
    });

    it('claude-sessionend reports an out-of-corpus transcript', () => {
        writeConfig();
        // Transcript outside ~/.claude/projects (e.g. a custom config dir):
        // only reachable via the hook's transcript_path.
        const path = writeTranscript(
            'custom/transcripts/sess-out.jsonl',
            claudeUsage({ sid: 'sess-out', input: 21, output: 3 }),
        );
        const res = runCli(['claude-sessionend', '--dry-run'], {
            home,
            stdin: JSON.stringify({
                transcript_path: path,
                session_id: 'sess-out',
            }),
        });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.body.sessions).toHaveLength(1);
        expect(payload.body.sessions[0]).toMatchObject({
            session_id: 'sess-out',
            input_tokens: 21,
        });
    });

    it('claude-sessionend uses the hook id for an id-less out-of-corpus transcript', () => {
        writeConfig();
        const path = writeTranscript(
            'custom/transcripts/whatever.jsonl',
            claudeUsage({ input: 7, output: 2 }),
        );
        const res = runCli(['claude-sessionend', '--dry-run'], {
            home,
            stdin: JSON.stringify({
                transcript_path: path,
                session_id: 'sess-hooked',
            }),
        });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.body.sessions).toHaveLength(1);
        expect(payload.body.sessions[0]).toMatchObject({
            session_id: 'sess-hooked',
            input_tokens: 7,
        });
    });

    it('claude-sessionend resolves a symlinked transcript_path to its corpus group', () => {
        writeConfig();
        const real = writeTranscript(
            '.claude/projects/demo/sess-cli.jsonl',
            CLAUDE,
        );
        const linkDir = join(home, 'links');
        mkdirSync(linkDir, { recursive: true });
        const link = join(linkDir, 'alias.jsonl');
        symlinkSync(real, link);
        const res = runCli(['claude-sessionend', '--dry-run'], {
            home,
            stdin: JSON.stringify({
                transcript_path: link,
                session_id: 'sess-cli',
            }),
        });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        // The alias must resolve to the in-corpus group — one row, no
        // duplicate counting through the second path.
        expect(payload.body.sessions).toHaveLength(1);
        expect(payload.body.sessions[0]).toMatchObject({
            session_id: 'sess-cli',
            input_tokens: 100,
        });
    });

    it.skipIf(userInfo().uid === 0)(
        'claude-sessionend withholds an out-of-corpus session with an unlistable subagents tree',
        () => {
            writeConfig();
            const path = writeTranscript(
                'custom/transcripts/sess-out.jsonl',
                claudeUsage({ sid: 'sess-out', input: 21, output: 3 }),
            );
            const agents = join(home, 'custom/transcripts/sess-out/subagents');
            mkdirSync(agents, { recursive: true });
            chmodSync(agents, 0o000);
            try {
                const res = runCli(['claude-sessionend', '--dry-run'], {
                    home,
                    stdin: JSON.stringify({
                        transcript_path: path,
                        session_id: 'sess-out',
                    }),
                });
                expect(res.status).toBe(0);
                // The root alone must not upload — the hidden subagents tree
                // may hold contributions this partial row would erase.
                expect(res.stderr).toContain('withheld');
                const payloads = parseDryRunPayloads(res.stdout);
                const ids = payloads.flatMap((p) =>
                    p.body.sessions.map(
                        (sess) => (sess as { session_id: string }).session_id,
                    ),
                );
                expect(ids).not.toContain('sess-out');
            } finally {
                chmodSync(agents, 0o755);
            }
        },
    );

    it.skipIf(userInfo().uid === 0)(
        'claude-sessionend reports a lone transcript in an unlistable parent',
        () => {
            writeConfig();
            // No subagents dir exists at all: the speculative canonical dir
            // being absent must NOT withhold this fully-readable session.
            const parent = join(home, 'custom/transcripts');
            const path = writeTranscript(
                'custom/transcripts/sess-lone.jsonl',
                claudeUsage({ sid: 'sess-lone', input: 13, output: 2 }),
            );
            chmodSync(parent, 0o311);
            try {
                const res = runCli(['claude-sessionend', '--dry-run'], {
                    home,
                    stdin: JSON.stringify({
                        transcript_path: path,
                        session_id: 'sess-lone',
                    }),
                });
                expect(res.status).toBe(0);
                const payload = JSON.parse(res.stdout.trim());
                expect(payload.body.sessions).toHaveLength(1);
                expect(payload.body.sessions[0]).toMatchObject({
                    session_id: 'sess-lone',
                    input_tokens: 13,
                });
            } finally {
                chmodSync(parent, 0o755);
            }
        },
    );

    it('allows --dry-run before the command name', () => {
        writeConfig();
        const path = writeTranscript('sess-cli.jsonl', CLAUDE);
        const res = runCli(['--dry-run', 'claude-report', path], { home });
        expect(res.status).toBe(0);
        const payload = JSON.parse(res.stdout.trim());
        expect(payload.dryRun).toBe(true);
        expect(payload.body.source).toBe('claude_code');
    });
});
