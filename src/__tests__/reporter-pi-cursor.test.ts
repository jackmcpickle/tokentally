import { afterEach, describe, expect, it, vi } from 'vitest';
// The reporter is a plain .mjs module; import its exported pure functions.
import {
    cursorFetchEvents,
    parseCursorEvents,
    parsePiRollout,
} from '../../reporter/tokentally.mjs';

// piDirs() is not bundle-exported (commands.ts consumes it internally), so the
// ~/.omp/agent/sessions root is covered by typecheck + source review only.

describe('parsePiRollout model_change attribution', () => {
    it('attributes usage to the model from the latest model_change', () => {
        const lines = [
            JSON.stringify({
                type: 'session',
                id: 'rec_0',
                sessionId: 'pi-mc-1',
                timestamp: '2026-07-19T07:00:00Z',
                cwd: '/w',
                version: 3,
            }),
            JSON.stringify({
                type: 'model_change',
                id: 'rec_1',
                parentId: 'rec_0',
                provider: 'anthropic',
                modelId: 'claude-sonnet-4-5',
                timestamp: '2026-07-19T07:00:01Z',
            }),
            // Assistant message without its own model -> model_change context.
            JSON.stringify({
                type: 'message',
                id: 'rec_2',
                parentId: 'rec_1',
                timestamp: '2026-07-19T07:00:05Z',
                message: {
                    role: 'assistant',
                    usage: {
                        input: 100,
                        output: 40,
                        cacheRead: 10,
                        cacheWrite: 2,
                    },
                },
            }),
            JSON.stringify({
                type: 'model_change',
                id: 'rec_3',
                parentId: 'rec_2',
                provider: 'openai-codex',
                modelId: 'gpt-5-codex',
                timestamp: '2026-07-19T07:01:00Z',
            }),
            JSON.stringify({
                type: 'message',
                id: 'rec_4',
                parentId: 'rec_3',
                timestamp: '2026-07-19T07:01:05Z',
                message: {
                    role: 'assistant',
                    usage: { input: 7, output: 3 },
                },
            }),
        ].join('\n');

        const parsed = parsePiRollout(lines);
        expect(parsed.session_id).toBe('pi-mc-1');
        expect(parsed.started_at).toBe(Date.parse('2026-07-19T07:00:00Z'));
        expect(parsed.models.get('claude-sonnet-4-5')).toMatchObject({
            input_tokens: 100,
            output_tokens: 40,
            cache_read_tokens: 10,
            cache_creation_tokens: 2,
        });
        expect(parsed.models.get('gpt-5-codex')).toMatchObject({
            input_tokens: 7,
            output_tokens: 3,
        });
    });

    it('lets a message-level model override the model_change context', () => {
        const lines = [
            JSON.stringify({
                type: 'model_change',
                id: 'rec_0',
                provider: 'anthropic',
                modelId: 'claude-sonnet-4-5',
                timestamp: '2026-07-19T08:00:00Z',
            }),
            JSON.stringify({
                type: 'message',
                id: 'rec_1',
                parentId: 'rec_0',
                message: {
                    role: 'assistant',
                    model: 'claude-opus-4-8',
                    usage: { input: 5, output: 6 },
                },
            }),
        ].join('\n');

        const parsed = parsePiRollout(lines);
        expect(parsed.models.has('claude-sonnet-4-5')).toBe(false);
        expect(parsed.models.get('claude-opus-4-8')).toMatchObject({
            input_tokens: 5,
            output_tokens: 6,
        });
    });
});

describe('parsePiRollout id dedup', () => {
    it('keeps the last occurrence of a repeated id', () => {
        const lines = [
            JSON.stringify({
                type: 'message',
                id: 'rec_1',
                message: {
                    role: 'assistant',
                    model: 'kimi-k2',
                    usage: { input: 10, output: 1 },
                },
            }),
            // Same id replayed on another branch with amended counts.
            JSON.stringify({
                type: 'message',
                id: 'rec_1',
                message: {
                    role: 'assistant',
                    model: 'kimi-k2',
                    usage: { input: 12, output: 2 },
                },
            }),
        ].join('\n');

        const parsed = parsePiRollout(lines);
        expect(parsed.models.get('kimi-k2')).toMatchObject({
            input_tokens: 12,
            output_tokens: 2,
        });
    });

    it('always sums records without a usable id', () => {
        const usage = { input: 10, output: 5 };
        const message = { role: 'assistant', model: 'kimi-k2', usage };
        const lines = [
            // No id at all, twice.
            JSON.stringify({ type: 'message', message }),
            JSON.stringify({ type: 'message', message }),
            // Blank id: not an identity, must not dedupe against itself.
            JSON.stringify({ type: 'message', id: '   ', message }),
            JSON.stringify({ type: 'message', id: '   ', message }),
            // Oversized id (> 1024 chars): treated the same way.
            JSON.stringify({ type: 'message', id: 'x'.repeat(1025), message }),
            JSON.stringify({ type: 'message', id: 'x'.repeat(1025), message }),
        ].join('\n');

        const parsed = parsePiRollout(lines);
        expect(parsed.models.get('kimi-k2')).toMatchObject({
            input_tokens: 60,
            output_tokens: 30,
        });
    });
});

describe('cursorFetchEvents pagination', () => {
    interface CursorPage {
        totalUsageEventsCount?: number | string;
        usageEvents?: unknown[];
        usageEventsDisplay?: unknown[];
    }

    function stubFetchPages(pages: CursorPage[]): {
        bodies: Array<{ page: number; pageSize: number }>;
    } {
        const bodies: Array<{ page: number; pageSize: number }> = [];
        vi.stubGlobal(
            'fetch',
            vi.fn((_url: unknown, init: { body: string }) => {
                bodies.push(JSON.parse(init.body));
                const payload = pages[bodies.length - 1] ?? {
                    usageEventsDisplay: [],
                };
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(payload),
                });
            }),
        );
        return { bodies };
    }

    function batch(count: number, offset = 0): unknown[] {
        return Array.from({ length: count }, (_, i) => ({
            timestamp: String(Date.UTC(2026, 6, 19) + offset + i),
            model: 'gpt-5',
            tokenUsage: { inputTokens: 1, outputTokens: 1 },
        }));
    }

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('continues past a short non-final page until the reported total', async () => {
        const { bodies } = stubFetchPages([
            { totalUsageEventsCount: 1000, usageEventsDisplay: batch(600) },
            // Total may arrive string-encoded on later pages.
            {
                totalUsageEventsCount: '1000',
                usageEventsDisplay: batch(400, 600),
            },
        ]);

        const events = await cursorFetchEvents('user::jwt', 0);
        expect(events).toHaveLength(1000);
        expect(bodies).toHaveLength(2);
        expect(bodies[1]?.page).toBe(2);
    });

    it('stops on an empty batch even when the total promises more', async () => {
        const { bodies } = stubFetchPages([
            { totalUsageEventsCount: 2000, usageEventsDisplay: batch(500) },
            { totalUsageEventsCount: 2000, usageEventsDisplay: [] },
        ]);

        const events = await cursorFetchEvents('user::jwt', 0);
        expect(events).toHaveLength(500);
        expect(bodies).toHaveLength(2);
    });

    it('stops once the collected events reach the total', async () => {
        const { bodies } = stubFetchPages([
            { totalUsageEventsCount: 3, usageEventsDisplay: batch(3) },
        ]);

        const events = await cursorFetchEvents('user::jwt', 0);
        expect(events).toHaveLength(3);
        expect(bodies).toHaveLength(1);
    });

    it('falls back to the short-page rule when no total is reported', async () => {
        // Legacy responses use `usageEvents` and omit the total count.
        const { bodies } = stubFetchPages([{ usageEvents: batch(3) }]);

        const events = await cursorFetchEvents('user::jwt', 0);
        expect(events).toHaveLength(3);
        expect(bodies).toHaveLength(1);
    });
});

describe('parseCursorEvents field mapping', () => {
    const DAY = Date.UTC(2026, 6, 19); // 2026-07-19T00:00:00Z

    it('accepts string-encoded token counts', () => {
        const rows = parseCursorEvents([
            {
                timestamp: String(DAY + 1000),
                model: 'claude-4.5-sonnet',
                tokenUsage: {
                    inputTokens: '11',
                    outputTokens: '22',
                    cacheReadTokens: '33',
                    cacheWriteTokens: '4',
                },
            },
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            session_id: 'cursor-2026-07-19',
            model: 'claude-4.5-sonnet',
            input_tokens: 11,
            output_tokens: 22,
            cache_read_tokens: 33,
            cache_creation_tokens: 4,
            reasoning_tokens: 0,
        });
    });

    it('skips events whose token usage is all zero', () => {
        const rows = parseCursorEvents([
            {
                timestamp: String(DAY + 1000),
                model: 'gpt-5',
                tokenUsage: {
                    inputTokens: 0,
                    outputTokens: 0,
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                    totalCents: 1.5,
                },
            },
            {
                timestamp: String(DAY + 2000),
                model: 'gpt-5',
                tokenUsage: { inputTokens: 9 },
            },
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.input_tokens).toBe(9);
    });
});
