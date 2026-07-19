import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
            'tokenmaxer: reported 1 row(s) for the current session',
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
            /tokenmaxer: caught up 1 row\(s\) from 1 file\(s\)/u,
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
