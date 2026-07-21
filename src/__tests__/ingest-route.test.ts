import { describe, expect, it } from 'vitest';
import { memoryKv } from '@/__tests__/helpers/kv';
import app from '@/index';
import type { Env } from '@/types';

type IngestResponse = {
    accepted: number;
    rejected: Array<{ index: number; error: string }>;
};

const USER = {
    id: 'user-1',
    username: 'tester',
    username_lower: 'tester',
    token_hash: 'stub-hash',
    created_at: 0,
};

type State = { upserted: number };

function db(state: State): D1Database {
    return {
        prepare(sql: string) {
            const self = {
                bind(..._args: unknown[]) {
                    return self;
                },
                async first<T>() {
                    if (sql.includes('FROM users WHERE token_hash')) {
                        return USER as T;
                    }
                    return null as T;
                },
                async run() {
                    return { success: true, meta: {} };
                },
                async all() {
                    return { results: [] };
                },
            };
            return self;
        },
        async batch(stmts: unknown[]) {
            state.upserted += stmts.length;
            return [];
        },
    } as unknown as D1Database;
}

function env(state: State): Env {
    return {
        DB: db(state),
        RATE_LIMIT: memoryKv(),
        ENVIRONMENT: 'test',
        PUBLIC_BASE_URL: 'https://tokenmaxer.quest',
        TURNSTYLE_SECRET_KEY: 'test-turnstile-secret',
    };
}

async function post(
    path: 'ingest' | 'history',
    body: unknown,
    state: State,
): Promise<Response> {
    return app.request(
        `https://tokenmaxer.quest/api/${path}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer tt_test-token',
            },
            body: JSON.stringify(body),
        },
        env(state),
    );
}

function rows(): unknown[] {
    return [
        { session_id: 's0', model: 'claude-opus-4-8', input_tokens: 10 },
        { session_id: 's1' }, // missing model — rejected per-row
        { session_id: 's2', model: 'claude-opus-4-8', input_tokens: 30 },
    ];
}

describe('POST /api/ingest', () => {
    it('upserts valid rows and reports invalid ones per-index', async () => {
        const state: State = { upserted: 0 };
        const res = await post(
            'ingest',
            { source: 'claude_code', sessions: rows() },
            state,
        );
        expect(res.status).toBe(200);
        expect(await res.json<IngestResponse>()).toEqual({
            accepted: 2,
            rejected: [{ index: 1, error: 'model is required' }],
        });
        expect(state.upserted).toBe(2);
    });

    it('skips the upsert when every row was rejected', async () => {
        const state: State = { upserted: 0 };
        const res = await post(
            'ingest',
            {
                source: 'claude_code',
                sessions: [{ session_id: 'sess-a', model: '' }],
            },
            state,
        );
        expect(res.status).toBe(200);
        expect(await res.json<IngestResponse>()).toEqual({
            accepted: 0,
            rejected: [{ index: 0, error: 'model is required' }],
        });
        expect(state.upserted).toBe(0);
    });

    it('accepts a >2B token row (issue #21) with an empty rejected list', async () => {
        const state: State = { upserted: 0 };
        const res = await post(
            'ingest',
            {
                source: 'codex',
                sessions: [
                    {
                        session_id: 's0',
                        model: 'gpt-5-codex',
                        input_tokens: 2_130_000_000,
                        cache_read_tokens: 2_100_000_000,
                    },
                ],
            },
            state,
        );
        expect(res.status).toBe(200);
        expect(await res.json<IngestResponse>()).toEqual({
            accepted: 1,
            rejected: [],
        });
        expect(state.upserted).toBe(1);
    });

    it('keeps the { error } shape for whole-request failures', async () => {
        const state: State = { upserted: 0 };
        const res = await post(
            'ingest',
            { source: 'nope', sessions: rows() },
            state,
        );
        expect(res.status).toBe(400);
        expect(await res.json<{ error: string }>()).toHaveProperty('error');
        expect(state.upserted).toBe(0);
    });

    it('still requires auth', async () => {
        const state: State = { upserted: 0 };
        const res = await app.request(
            'https://tokenmaxer.quest/api/ingest',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: 'claude_code',
                    sessions: rows(),
                }),
            },
            env(state),
        );
        expect(res.status).toBe(401);
        expect(state.upserted).toBe(0);
    });
});

describe('POST /api/history', () => {
    it('returns the same accepted/rejected shape as ingest', async () => {
        const state: State = { upserted: 0 };
        const res = await post(
            'history',
            { source: 'claude_code', sessions: rows() },
            state,
        );
        expect(res.status).toBe(200);
        expect(await res.json<IngestResponse>()).toEqual({
            accepted: 2,
            rejected: [{ index: 1, error: 'model is required' }],
        });
        expect(state.upserted).toBe(2);
    });
});
