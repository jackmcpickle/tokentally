import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// The reporter is a plain .mjs module; import its exported pure functions.
import {
    codexParentSequenceById,
    loadConfig,
    parseClaudeTranscript,
    parseCodexRollout,
    parseOpencodeMessages,
    parseCursorEvents,
    parsePiRollout,
    parseSetProfileUrlArgs,
    resolveCodexInherited,
    buildProfileUrlBody,
    buildProfileUrlDryRun,
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

    it('drops <synthetic> model rows from toRows', () => {
        const parsed = parseClaudeTranscript(
            [
                JSON.stringify({
                    type: 'assistant',
                    timestamp: '2026-07-18T10:00:05Z',
                    sessionId: 'sess-syn',
                    message: {
                        model: 'claude-sonnet-5',
                        usage: { input_tokens: 10, output_tokens: 20 },
                    },
                }),
                JSON.stringify({
                    type: 'assistant',
                    timestamp: '2026-07-18T10:00:06Z',
                    sessionId: 'sess-syn',
                    message: {
                        model: '<synthetic>',
                        usage: { input_tokens: 0, output_tokens: 0 },
                    },
                }),
            ].join('\n'),
        );
        expect(parsed.models.has('<synthetic>')).toBe(true);
        const rows = toRows(parsed, '/x/sess-syn.jsonl');
        expect(rows.map((r) => r.model)).toEqual(['claude-sonnet-5']);
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

    it('does not treat root sessions as inheriting history', () => {
        const parsed = parseCodexRollout(CODEX);
        expect(parsed.parent_id).toBeNull();
        expect(parsed.pending_inherited).toHaveLength(0);
    });
});

function codexLine(type: string, payload: object, ts = '2026-07-18T09:00:00Z') {
    return JSON.stringify({ type, timestamp: ts, payload });
}

function tokenCount(
    input: number,
    cached: number,
    output: number,
    reasoning = 0,
) {
    return codexLine('event_msg', {
        type: 'token_count',
        info: {
            last_token_usage: {
                input_tokens: input,
                cached_input_tokens: cached,
                cache_write_input_tokens: 0,
                output_tokens: output,
                reasoning_output_tokens: reasoning,
            },
        },
    });
}

const CHILD_META = codexLine('session_meta', {
    id: 'child-1',
    source: {
        subagent: {
            thread_spawn: { parent_thread_id: 'parent-1', depth: 1 },
        },
    },
});
const TURN_CONTEXT = codexLine('turn_context', { model: 'gpt-5-codex' });
const TRIGGER_TURN = codexLine('inter_agent_communication_metadata', {
    trigger_turn: true,
});
const PARENT_ROLLOUT = [
    codexLine('session_meta', { id: 'parent-1', model: 'gpt-5-codex' }),
    tokenCount(100, 80, 10, 2),
    tokenCount(200, 160, 20, 4),
    tokenCount(300, 240, 30, 6),
].join('\n');

describe('parseCodexRollout thread-spawn children', () => {
    it('drops inherited pre-boundary usage recorded before turn_context (unknown variant)', () => {
        const parsed = parseCodexRollout(
            [
                CHILD_META,
                tokenCount(100, 80, 10, 2),
                tokenCount(200, 160, 20, 4),
                TURN_CONTEXT,
                TRIGGER_TURN,
                tokenCount(11, 0, 5, 1),
            ].join('\n'),
        );
        // Dropped replay leaves a zero-total row so a corrected re-report
        // overwrites any inflated row the pre-fix reporter posted.
        const unknown = parsed.models.get('unknown');
        expect(unknown?.input_tokens).toBe(0);
        expect(unknown?.output_tokens).toBe(0);
        expect(unknown?.cache_read_tokens).toBe(0);
        const t = parsed.models.get('gpt-5-codex');
        expect(t?.input_tokens).toBe(11);
        expect(t?.output_tokens).toBe(5);
        expect(parsed.pending_inherited).toHaveLength(0);
    });

    it('emits zero rows for a fully inherited child so stale server rows get overwritten', () => {
        const parsed = parseCodexRollout(
            [
                CHILD_META,
                tokenCount(100, 80, 10, 2),
                TURN_CONTEXT,
                tokenCount(200, 160, 20, 4),
                TRIGGER_TURN,
            ].join('\n'),
        );
        const rows = toRows(parsed, '/x/rollout-child-1.jsonl');
        expect(rows.map((r) => r.model).sort()).toEqual([
            'gpt-5-codex',
            'unknown',
        ]);
        for (const row of rows) {
            expect(row.input_tokens).toBe(0);
            expect(row.output_tokens).toBe(0);
        }
    });

    it('drops inherited pre-boundary usage recorded after turn_context (named variant)', () => {
        const parsed = parseCodexRollout(
            [
                CHILD_META,
                TURN_CONTEXT,
                tokenCount(100, 80, 10, 2),
                tokenCount(200, 160, 20, 4),
                TRIGGER_TURN,
                tokenCount(11, 0, 5, 1),
            ].join('\n'),
        );
        const t = parsed.models.get('gpt-5-codex');
        expect(t?.input_tokens).toBe(11);
        expect(t?.cache_read_tokens).toBe(0);
        expect(t?.reasoning_tokens).toBe(1);
    });

    it('accepts the boundary marker wrapped in an event_msg', () => {
        const parsed = parseCodexRollout(
            [
                CHILD_META,
                TURN_CONTEXT,
                tokenCount(100, 80, 10, 2),
                codexLine('event_msg', {
                    type: 'inter_agent_communication_metadata',
                    trigger_turn: true,
                }),
                tokenCount(11, 0, 5),
            ].join('\n'),
        );
        expect(parsed.models.get('gpt-5-codex')?.input_tokens).toBe(11);
    });

    it('holds pending usage for legacy children without the marker', () => {
        const parsed = parseCodexRollout(
            [
                CHILD_META,
                TURN_CONTEXT,
                tokenCount(100, 80, 10, 2),
                tokenCount(200, 160, 20, 4),
                tokenCount(11, 0, 5, 1),
            ].join('\n'),
        );
        expect(parsed.parent_id).toBe('parent-1');
        expect(parsed.models.size).toBe(0);
        expect(parsed.pending_inherited).toHaveLength(3);
    });

    it('resolveCodexInherited strips the matched parent prefix', () => {
        const parsed = parseCodexRollout(
            [
                CHILD_META,
                TURN_CONTEXT,
                tokenCount(100, 80, 10, 2),
                tokenCount(200, 160, 20, 4),
                tokenCount(11, 0, 5, 1),
            ].join('\n'),
        );
        resolveCodexInherited(parsed, PARENT_ROLLOUT);
        const t = parsed.models.get('gpt-5-codex');
        expect(t?.input_tokens).toBe(11);
        expect(t?.output_tokens).toBe(5);
        expect(parsed.pending_inherited).toHaveLength(0);
    });

    it('ignores a later session_meta after the boundary (resume / replayed parent meta)', () => {
        const parsed = parseCodexRollout(
            [
                CHILD_META,
                TURN_CONTEXT,
                tokenCount(100, 80, 10, 2),
                TRIGGER_TURN,
                codexLine('session_meta', {
                    id: 'parent-1',
                    source: {
                        subagent: {
                            thread_spawn: {
                                parent_thread_id: 'grandparent-1',
                                depth: 1,
                            },
                        },
                    },
                }),
                tokenCount(11, 0, 5, 1),
            ].join('\n'),
        );
        expect(parsed.parent_id).toBe('parent-1');
        expect(parsed.pending_inherited).toHaveLength(0);
        expect(parsed.models.get('gpt-5-codex')?.input_tokens).toBe(11);
    });

    it('does not let a trigger_turn marker wipe a forked session’s held usage', () => {
        const parsed = parseCodexRollout(
            [
                codexLine('session_meta', {
                    id: 'fork-1',
                    source: { forked_from_id: 'parent-1' },
                }),
                TURN_CONTEXT,
                tokenCount(100, 80, 10, 2),
                tokenCount(200, 160, 20, 4),
                TRIGGER_TURN,
                tokenCount(11, 0, 5, 1),
            ].join('\n'),
        );
        expect(parsed.models.size).toBe(0);
        expect(parsed.pending_inherited).toHaveLength(3);
        resolveCodexInherited(parsed, PARENT_ROLLOUT);
        const t = parsed.models.get('gpt-5-codex');
        expect(t?.input_tokens).toBe(11);
        expect(t?.output_tokens).toBe(5);
    });

    it('resolveCodexInherited keeps a short run that matches the parent only mid-sequence', () => {
        const parsed = parseCodexRollout(
            [
                CHILD_META,
                TURN_CONTEXT,
                tokenCount(200, 160, 20, 4),
                tokenCount(300, 240, 30, 6),
                tokenCount(11, 0, 5, 1),
            ].join('\n'),
        );
        resolveCodexInherited(parsed, PARENT_ROLLOUT);
        expect(parsed.models.get('gpt-5-codex')?.input_tokens).toBe(511);
    });

    it('resolveCodexInherited drops a strong interior match (parent is itself a subagent)', () => {
        // Parent file starts with its own inherited replay (50...), so the
        // child's replayed prefix only matches from the parent's second event.
        const nestedParent = [
            codexLine('session_meta', { id: 'parent-1', model: 'gpt-5-codex' }),
            tokenCount(50, 0, 5, 1),
            tokenCount(100, 80, 10, 2),
            tokenCount(200, 160, 20, 4),
            tokenCount(300, 240, 30, 6),
        ].join('\n');
        const parsed = parseCodexRollout(
            [
                CHILD_META,
                TURN_CONTEXT,
                tokenCount(100, 80, 10, 2),
                tokenCount(200, 160, 20, 4),
                tokenCount(300, 240, 30, 6),
                tokenCount(11, 0, 5, 1),
            ].join('\n'),
        );
        resolveCodexInherited(parsed, nestedParent);
        expect(parsed.models.get('gpt-5-codex')?.input_tokens).toBe(11);
    });

    it('resolveCodexInherited emits zero rows when everything was inherited', () => {
        const parsed = parseCodexRollout(
            [
                CHILD_META,
                TURN_CONTEXT,
                tokenCount(100, 80, 10, 2),
                tokenCount(200, 160, 20, 4),
            ].join('\n'),
        );
        resolveCodexInherited(parsed, PARENT_ROLLOUT);
        const rows = toRows(parsed, '/x/rollout-child-1.jsonl');
        expect(rows.map((r) => r.model)).toEqual(['gpt-5-codex']);
        expect(rows[0]?.input_tokens).toBe(0);
        expect(rows[0]?.output_tokens).toBe(0);
    });

    it('resolveCodexInherited keeps an anchored match of only non-distinctive tuples', () => {
        // All-zero-input tuples repeat by coincidence (heartbeats, retries);
        // an anchored run with no real input is not evidence of replay.
        const zeroParent = [
            codexLine('session_meta', { id: 'parent-1', model: 'gpt-5-codex' }),
            tokenCount(0, 0, 5, 1),
            tokenCount(0, 0, 5, 1),
        ].join('\n');
        const parsed = parseCodexRollout(
            [
                CHILD_META,
                TURN_CONTEXT,
                tokenCount(0, 0, 5, 1),
                tokenCount(0, 0, 5, 1),
            ].join('\n'),
        );
        resolveCodexInherited(parsed, zeroParent);
        expect(parsed.models.get('gpt-5-codex')?.output_tokens).toBe(10);
    });

    it('resolveCodexInherited keeps a single-event match (may be coincidence)', () => {
        const parsed = parseCodexRollout(
            [
                CHILD_META,
                TURN_CONTEXT,
                tokenCount(100, 80, 10, 2),
                tokenCount(11, 0, 5, 1),
            ].join('\n'),
        );
        resolveCodexInherited(parsed, PARENT_ROLLOUT);
        expect(parsed.models.get('gpt-5-codex')?.input_tokens).toBe(111);
    });

    it('resolveCodexInherited counts everything when the parent is missing', () => {
        const parsed = parseCodexRollout(
            [
                CHILD_META,
                TURN_CONTEXT,
                tokenCount(100, 80, 10, 2),
                tokenCount(11, 0, 5, 1),
            ].join('\n'),
        );
        resolveCodexInherited(parsed, null);
        expect(parsed.models.get('gpt-5-codex')?.input_tokens).toBe(111);
    });

    it('resolveCodexInherited drops a replayed prefix containing an adjacent duplicated row', () => {
        // Replay occasionally writes a token_count row twice back-to-back
        // even though the parent's own file has it once; the duplicate is
        // still replayed history and must be dropped with the rest.
        const parsed = parseCodexRollout(
            [
                CHILD_META,
                TURN_CONTEXT,
                tokenCount(100, 80, 10, 2),
                tokenCount(100, 80, 10, 2),
                tokenCount(200, 160, 20, 4),
                tokenCount(11, 0, 5, 1),
            ].join('\n'),
        );
        resolveCodexInherited(parsed, PARENT_ROLLOUT);
        const t = parsed.models.get('gpt-5-codex');
        expect(t?.input_tokens).toBe(11);
        expect(t?.output_tokens).toBe(5);
        expect(parsed.pending_inherited).toHaveLength(0);
    });

    it('resolveCodexInherited keeps a duplicated row backed by only one real parent match', () => {
        // The duplicate tolerance must not lower the evidence bar: a genuine
        // parent match plus its own adjacent duplicate is still a
        // single-event match and may be coincidence, so nothing is dropped.
        const parsed = parseCodexRollout(
            [
                CHILD_META,
                TURN_CONTEXT,
                tokenCount(100, 80, 10, 2),
                tokenCount(100, 80, 10, 2),
                tokenCount(11, 0, 5, 1),
            ].join('\n'),
        );
        resolveCodexInherited(parsed, PARENT_ROLLOUT);
        expect(parsed.models.get('gpt-5-codex')?.input_tokens).toBe(211);
    });

    it('resolveCodexInherited drops a duplicated row inside an interior match', () => {
        // Parent starts with its own inherited replay, so the child's prefix
        // matches only from the parent's second event; the duplicate
        // tolerance applies on the interior path too.
        const nestedParent = [
            codexLine('session_meta', { id: 'parent-1', model: 'gpt-5-codex' }),
            tokenCount(50, 0, 5, 1),
            tokenCount(100, 80, 10, 2),
            tokenCount(200, 160, 20, 4),
            tokenCount(300, 240, 30, 6),
        ].join('\n');
        const parsed = parseCodexRollout(
            [
                CHILD_META,
                TURN_CONTEXT,
                tokenCount(100, 80, 10, 2),
                tokenCount(100, 80, 10, 2),
                tokenCount(200, 160, 20, 4),
                tokenCount(300, 240, 30, 6),
                tokenCount(11, 0, 5, 1),
            ].join('\n'),
        );
        resolveCodexInherited(parsed, nestedParent);
        expect(parsed.models.get('gpt-5-codex')?.input_tokens).toBe(11);
    });
});

describe('codexParentSequenceById', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'tokenmaxer-codex-'));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('prefers the larger duplicate rollout in the near-dir probe', () => {
        const uuid = '0f9a41f2-1111-4222-8333-abcdefabcdef';
        // Stale truncated copy of the same session sits beside the complete
        // one and sorts first in the directory listing; the near-dir probe
        // must apply the same larger-file-wins rule as the full index.
        writeFileSync(
            join(dir, `rollout-2026-07-18T08-00-00-${uuid}.jsonl`),
            [
                codexLine('session_meta', { id: uuid, model: 'gpt-5-codex' }),
                tokenCount(100, 80, 10, 2),
            ].join('\n'),
        );
        writeFileSync(
            join(dir, `rollout-2026-07-18T09-00-00-${uuid}.jsonl`),
            [
                codexLine('session_meta', { id: uuid, model: 'gpt-5-codex' }),
                tokenCount(100, 80, 10, 2),
                tokenCount(200, 160, 20, 4),
                tokenCount(300, 240, 30, 6),
            ].join('\n'),
        );
        const childPath = join(
            dir,
            'rollout-2026-07-18T09-05-00-1e9a41f2-1111-4222-8333-abcdefabcdef.jsonl',
        );
        writeFileSync(childPath, CHILD_META);
        const keys = codexParentSequenceById(uuid, childPath);
        expect(keys).toHaveLength(3);
        expect(keys?.[2]).toBe('300|240|0|30|6');
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

describe('parseCursorEvents', () => {
    function ev(ts: number | string, model: string, usage: unknown) {
        return {
            timestamp: String(ts),
            model,
            tokenUsage: usage,
        };
    }
    const DAY = Date.UTC(2026, 6, 18); // 2026-07-18T00:00:00Z

    it('buckets events by UTC day and model', () => {
        const rows = parseCursorEvents([
            ev(DAY + 1000, 'claude-4.5-sonnet', {
                inputTokens: 10,
                outputTokens: 20,
                cacheReadTokens: 30,
                cacheWriteTokens: 5,
            }),
            ev(DAY + 5000, 'claude-4.5-sonnet', {
                inputTokens: 1,
                outputTokens: 2,
                cacheReadTokens: 3,
                cacheWriteTokens: 4,
            }),
            ev(DAY + 6000, 'gpt-5', { inputTokens: 7, outputTokens: 8 }),
            ev(DAY + 86_400_000, 'gpt-5', {
                inputTokens: 100,
                outputTokens: 1,
            }),
        ]);
        expect(rows).toHaveLength(3);
        const sonnet = rows.find((r) => r.model === 'claude-4.5-sonnet');
        expect(sonnet).toMatchObject({
            session_id: 'cursor-2026-07-18',
            started_at: DAY,
            input_tokens: 11,
            output_tokens: 22,
            cache_read_tokens: 33,
            cache_creation_tokens: 9,
            reasoning_tokens: 0,
        });
        const day2 = rows.find((r) => r.session_id === 'cursor-2026-07-19');
        expect(day2).toMatchObject({ model: 'gpt-5', input_tokens: 100 });
    });

    it('skips malformed events and empty input', () => {
        expect(parseCursorEvents([])).toEqual([]);
        expect(
            parseCursorEvents([
                null,
                {},
                {
                    timestamp: 'nope',
                    model: 'm',
                    tokenUsage: { inputTokens: 1 },
                },
                { timestamp: '123', tokenUsage: { inputTokens: 1 } }, // no model -> 'unknown'
            ]),
        ).toHaveLength(1);
    });
});

describe('set-profile-url helpers', () => {
    it('parses a url argument', () => {
        expect(parseSetProfileUrlArgs(['https://example.com/me'])).toEqual({
            clear: false,
            url: 'https://example.com/me',
        });
    });

    it('parses --clear', () => {
        expect(parseSetProfileUrlArgs(['--clear'])).toEqual({ clear: true });
    });

    it('rejects missing args', () => {
        expect(() => parseSetProfileUrlArgs([])).toThrow(/set-profile-url/u);
    });

    it('builds JSON bodies', () => {
        expect(
            buildProfileUrlBody({
                clear: false,
                url: 'https://example.com/me',
            }),
        ).toEqual({ url: 'https://example.com/me' });
        expect(buildProfileUrlBody({ clear: true })).toEqual({ url: null });
    });

    it('builds redacted dry-run payloads for set and clear', () => {
        const endpoint = 'https://tokenmaxer.quest/api/profile';
        const headers = {
            'Content-Type': 'application/json',
            Authorization: 'Bearer <redacted>',
        };
        expect(
            buildProfileUrlDryRun({
                endpoint,
                body: { url: 'https://example.com/me' },
            }),
        ).toEqual({
            method: 'POST',
            url: endpoint,
            headers,
            body: { url: 'https://example.com/me' },
        });
        expect(
            buildProfileUrlDryRun({ endpoint, body: { url: null } }),
        ).toEqual({
            method: 'POST',
            url: endpoint,
            headers,
            body: { url: null },
        });
    });
});

describe('loadConfig', () => {
    const envKeys = [
        'TOKENMAXER_API_BASE',
        'TOKENMAXER_TOKEN',
        'TOKENTALLY_API_BASE',
        'TOKENTALLY_TOKEN',
    ] as const;
    let home: string;
    let savedHome: string | undefined;
    const savedEnv: Partial<
        Record<(typeof envKeys)[number], string | undefined>
    > = {};

    function clearEnv(key: (typeof envKeys)[number] | 'HOME') {
        Reflect.deleteProperty(process.env, key);
    }

    beforeEach(() => {
        home = mkdtempSync(join(tmpdir(), 'tokenmaxer-cfg-'));
        savedHome = process.env.HOME;
        process.env.HOME = home;
        for (const key of envKeys) {
            savedEnv[key] = process.env[key];
            clearEnv(key);
        }
    });

    afterEach(() => {
        if (savedHome === undefined) clearEnv('HOME');
        else process.env.HOME = savedHome;
        for (const key of envKeys) {
            if (savedEnv[key] === undefined) clearEnv(key);
            else process.env[key] = savedEnv[key];
        }
        rmSync(home, { recursive: true, force: true });
    });

    function writeCfg(dirName: string, data: object) {
        const dir = join(home, dirName);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'config.json'), JSON.stringify(data));
    }

    it('loads ~/.tokenmaxer/config.json', () => {
        writeCfg('.tokenmaxer', {
            apiBase: 'https://example.com',
            token: 'tt_new',
        });
        expect(loadConfig()).toEqual({
            apiBase: 'https://example.com',
            token: 'tt_new',
            cursorCookie: undefined,
        });
    });

    it('falls back to ~/.tokentally/config.json', () => {
        writeCfg('.tokentally', {
            apiBase: 'https://legacy.com/',
            token: 'tt_old',
        });
        expect(loadConfig()).toMatchObject({
            apiBase: 'https://legacy.com',
            token: 'tt_old',
        });
    });

    it('prefers ~/.tokenmaxer over ~/.tokentally', () => {
        writeCfg('.tokenmaxer', {
            apiBase: 'https://new.com',
            token: 'tt_new',
        });
        writeCfg('.tokentally', {
            apiBase: 'https://old.com',
            token: 'tt_old',
        });
        expect(loadConfig().token).toBe('tt_new');
    });

    it('prefers TOKENMAXER_* over TOKENTALLY_* over file', () => {
        writeCfg('.tokenmaxer', {
            apiBase: 'https://file.com',
            token: 'tt_file',
        });
        process.env.TOKENTALLY_TOKEN = 'tt_legacy_env';
        process.env.TOKENMAXER_TOKEN = 'tt_new_env';
        process.env.TOKENMAXER_API_BASE = 'https://env.com';
        expect(loadConfig()).toMatchObject({
            apiBase: 'https://env.com',
            token: 'tt_new_env',
        });
    });

    it('uses TOKENTALLY_* when TOKENMAXER_* unset', () => {
        process.env.TOKENTALLY_API_BASE = 'https://legacy-env.com';
        process.env.TOKENTALLY_TOKEN = 'tt_legacy_env';
        expect(loadConfig()).toMatchObject({
            apiBase: 'https://legacy-env.com',
            token: 'tt_legacy_env',
        });
    });

    it('throws a tokenmaxer-branded error when unconfigured', () => {
        expect(() => loadConfig()).toThrow(
            /tokenmaxer not configured.*~\/\.tokenmaxer/u,
        );
    });
});
