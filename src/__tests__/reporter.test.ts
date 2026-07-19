import { describe, expect, it } from 'vitest';
// The reporter is a plain .mjs module; import its exported pure functions.
import {
    parseClaudeTranscript,
    parseCodexRollout,
    parseOpencodeMessages,
    parsePiRollout,
    sessionIdFromPath,
    toRows,
} from '../../reporter/tokentally.mjs';

const CLAUDE = [
    JSON.stringify({
        type: 'user',
        timestamp: '2026-07-18T10:00:00Z',
        sessionId: 'sess-abc',
    }),
    JSON.stringify({
        type: 'assistant',
        timestamp: '2026-07-18T10:00:05Z',
        sessionId: 'sess-abc',
        message: {
            model: 'claude-opus-4-8-20260101',
            usage: {
                input_tokens: 100,
                output_tokens: 200,
                cache_read_input_tokens: 5000,
                cache_creation_input_tokens: 50,
            },
        },
    }),
    JSON.stringify({
        type: 'assistant',
        timestamp: '2026-07-18T10:01:00Z',
        message: {
            model: 'claude-opus-4-8-20260101',
            usage: { input_tokens: 10, output_tokens: 20 },
        },
    }),
    'not json — should be skipped',
].join('\n');

const CODEX = [
    JSON.stringify({
        type: 'session_meta',
        timestamp: '2026-07-18T09:00:00Z',
        payload: { id: 'codex-xyz', model: 'gpt-5-codex' },
    }),
    JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-07-18T09:00:10Z',
        payload: {
            type: 'token_count',
            info: {
                last_token_usage: {
                    input_tokens: 120,
                    cached_input_tokens: 20,
                    cache_write_input_tokens: 0,
                    output_tokens: 45,
                    reasoning_output_tokens: 10,
                    total_tokens: 195,
                },
            },
        },
    }),
    JSON.stringify({
        type: 'turn_context',
        timestamp: '2026-07-18T09:01:00Z',
        payload: { model: 'o3' },
    }),
    JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-07-18T09:01:10Z',
        payload: {
            type: 'token_count',
            info: {
                last_token_usage: {
                    input_tokens: 30,
                    cached_input_tokens: 0,
                    output_tokens: 15,
                    reasoning_output_tokens: 5,
                    total_tokens: 50,
                },
            },
        },
    }),
].join('\n');

describe('parseClaudeTranscript', () => {
    it('sums usage per model and reads session id + start time', () => {
        const parsed = parseClaudeTranscript(CLAUDE);
        expect(parsed.session_id).toBe('sess-abc');
        expect(parsed.started_at).toBe(Date.parse('2026-07-18T10:00:00Z'));
        const t = parsed.models.get('claude-opus-4-8-20260101');
        expect(t).toBeDefined();
        if (!t) throw new Error('expected claude-opus model usage');
        expect(t.input_tokens).toBe(110);
        expect(t.output_tokens).toBe(220);
        expect(t.cache_read_tokens).toBe(5000);
        expect(t.cache_creation_tokens).toBe(50);
    });

    it('emits one row per model via toRows', () => {
        const rows = toRows(parseClaudeTranscript(CLAUDE), '/x/sess-abc.jsonl');
        expect(rows).toHaveLength(1);
        expect(rows[0]?.session_id).toBe('sess-abc');
        expect(rows[0]?.model).toBe('claude-opus-4-8-20260101');
    });
});

describe('parseCodexRollout', () => {
    it('attributes each turn to the active model', () => {
        const parsed = parseCodexRollout(CODEX);
        expect(parsed.session_id).toBe('codex-xyz');
        const gpt = parsed.models.get('gpt-5-codex');
        const o3 = parsed.models.get('o3');
        expect(gpt).toBeDefined();
        expect(o3).toBeDefined();
        if (!gpt || !o3)
            throw new Error('expected gpt-5-codex and o3 model usage');
        expect(gpt.input_tokens).toBe(120);
        expect(gpt.cache_read_tokens).toBe(20);
        expect(gpt.reasoning_tokens).toBe(10);
        expect(o3.input_tokens).toBe(30);
        expect(o3.output_tokens).toBe(15);
    });
});

const OPENCODE_MESSAGES = [
    {
        id: 'msg_1',
        role: 'user',
        sessionID: 'ses_abc',
        time: { created: Date.parse('2026-07-18T08:00:00Z') },
    },
    {
        id: 'msg_2',
        role: 'assistant',
        sessionID: 'ses_abc',
        modelID: 'claude-sonnet-4-20250514',
        time: { created: Date.parse('2026-07-18T08:00:05Z') },
        tokens: {
            input: 100,
            output: 200,
            reasoning: 5,
            cache: { read: 5000, write: 50 },
        },
    },
    {
        id: 'msg_3',
        role: 'assistant',
        sessionID: 'ses_abc',
        modelID: 'claude-sonnet-4-20250514',
        time: { created: Date.parse('2026-07-18T08:01:00Z') },
        tokens: { input: 10, output: 20, cache: { read: 0, write: 0 } },
    },
];

describe('parseOpencodeMessages', () => {
    it('sums tokens per model and reads session id + earliest start', () => {
        const parsed = parseOpencodeMessages(OPENCODE_MESSAGES);
        expect(parsed.session_id).toBe('ses_abc');
        expect(parsed.started_at).toBe(Date.parse('2026-07-18T08:00:00Z'));
        const t = parsed.models.get('claude-sonnet-4-20250514');
        expect(t).toBeDefined();
        if (!t) throw new Error('expected opencode model usage');
        expect(t.input_tokens).toBe(110);
        expect(t.output_tokens).toBe(220);
        expect(t.reasoning_tokens).toBe(5);
        expect(t.cache_read_tokens).toBe(5000);
        expect(t.cache_creation_tokens).toBe(50);
    });

    it('emits one row per model with the session id via toRows', () => {
        const rows = toRows(
            parseOpencodeMessages(OPENCODE_MESSAGES),
            'ses_abc',
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.session_id).toBe('ses_abc');
        expect(rows[0]?.model).toBe('claude-sonnet-4-20250514');
    });
});

describe('parsePiRollout', () => {
    it('sums usage per model and dedupes repeated record ids', () => {
        const lines = [
            JSON.stringify({
                type: 'session',
                id: 'rec_0',
                sessionId: 'pi-123',
                timestamp: '2026-07-18T07:00:00Z',
                model: 'kimi-k2',
            }),
            JSON.stringify({
                type: 'assistant',
                id: 'rec_1',
                model: 'kimi-k2',
                usage: {
                    input: 120,
                    output: 45,
                    cacheRead: 20,
                    cacheWrite: 3,
                },
            }),
            // Same record repeated on another branch — must NOT double-count.
            JSON.stringify({
                type: 'assistant',
                id: 'rec_1',
                model: 'kimi-k2',
                usage: {
                    input: 120,
                    output: 45,
                    cacheRead: 20,
                    cacheWrite: 3,
                },
            }),
            JSON.stringify({
                type: 'assistant',
                id: 'rec_2',
                model: 'kimi-k2',
                usage: { input: 30, output: 15 },
            }),
        ].join('\n');

        const parsed = parsePiRollout(lines);
        expect(parsed.session_id).toBe('pi-123');
        expect(parsed.started_at).toBe(Date.parse('2026-07-18T07:00:00Z'));
        const t = parsed.models.get('kimi-k2');
        expect(t).toBeDefined();
        if (!t) throw new Error('expected pi model usage');
        expect(t.input_tokens).toBe(150);
        expect(t.output_tokens).toBe(60);
        expect(t.cache_read_tokens).toBe(20);
        expect(t.cache_creation_tokens).toBe(3);
    });
});

describe('sessionIdFromPath', () => {
    it('strips rollout- prefix and .jsonl suffix', () => {
        expect(
            sessionIdFromPath('/a/b/rollout-2026-07-18T09-00-00-uuid.jsonl'),
        ).toBe('2026-07-18T09-00-00-uuid');
        expect(sessionIdFromPath('/c/sess-abc.jsonl')).toBe('sess-abc');
    });
});
