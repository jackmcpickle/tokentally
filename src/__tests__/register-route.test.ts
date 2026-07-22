import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryKv } from '@/__tests__/helpers/kv';
import app from '@/index';
import type { Env } from '@/types';

type InsertRow = {
    id: string;
    username: string;
    username_lower: string;
    token_hash: string;
    created_at: number;
    profile_url: string | null;
    country: string;
};

const state = {
    users: [] as InsertRow[],
    lastInsert: null as InsertRow | null,
};

function db(): D1Database {
    return {
        prepare(sql: string) {
            const self = {
                binds: [] as unknown[],
                bind(...args: unknown[]) {
                    self.binds = args;
                    return self;
                },
                async first<T>() {
                    if (
                        sql.includes(
                            'SELECT id FROM users WHERE username_lower',
                        )
                    ) {
                        const lower = String(self.binds[0]);
                        const hit = state.users.find(
                            (u) => u.username_lower === lower,
                        );
                        return (hit ? { id: hit.id } : null) as T;
                    }
                    return null;
                },
                async run() {
                    if (sql.includes('INSERT INTO users')) {
                        const row: InsertRow = {
                            id: self.binds[0] as string,
                            username: self.binds[1] as string,
                            username_lower: self.binds[2] as string,
                            token_hash: self.binds[3] as string,
                            created_at: self.binds[4] as number,
                            profile_url: self.binds[5] as string | null,
                            country: self.binds[6] as string,
                        };
                        if (
                            state.users.some(
                                (u) => u.username_lower === row.username_lower,
                            )
                        ) {
                            throw new Error('UNIQUE constraint failed');
                        }
                        state.users.push(row);
                        state.lastInsert = row;
                    }
                    return { success: true, meta: {} };
                },
                async all() {
                    return { results: [] };
                },
            };
            return self;
        },
    } as unknown as D1Database;
}

function env(over: Partial<Env> = {}): Env {
    return {
        DB: db(),
        RATE_LIMIT: memoryKv(),
        ENVIRONMENT: 'test',
        PUBLIC_BASE_URL: 'https://tokenmaxer.quest',
        TURNSTYLE_SECRET_KEY: 'test-turnstile-secret',
        ...over,
    };
}

async function register(
    body: Record<string, unknown>,
    over: Partial<Env> = {},
    headers: Record<string, string> = {},
): Promise<Response> {
    return app.request(
        'https://tokenmaxer.quest/api/register',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
            // Country is required; default it so existing cases stay valid.
            // A case can override or omit it via an explicit `country` key.
            body: JSON.stringify({ country: 'US', ...body }),
        },
        env(over),
    );
}

describe('POST /api/register', () => {
    beforeEach(() => {
        state.users = [];
        state.lastInsert = null;
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.includes('challenges.cloudflare.com/turnstile')) {
                    return Response.json({ success: true });
                }
                return new Response('not found', { status: 404 });
            }),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('stores a validated profile_url when url is provided', async () => {
        const res = await register({
            username: 'alice',
            turnstileToken: 'ok',
            url: 'https://example.com/me',
        });
        expect(res.status).toBe(201);
        const json = await res.json<{
            id: string;
            username: string;
            token: string;
        }>();
        expect(json.username).toBe('alice');
        expect(json.token).toMatch(/^tt_/u);
        expect(state.lastInsert?.profile_url).toBe('https://example.com/me');
    });

    it('leaves profile_url null when url is omitted', async () => {
        const res = await register({
            username: 'bob',
            turnstileToken: 'ok',
        });
        expect(res.status).toBe(201);
        expect(state.lastInsert?.profile_url).toBeNull();
    });

    it('rejects invalid urls without inserting', async () => {
        const res = await register({
            username: 'carol',
            turnstileToken: 'ok',
            url: 'http://example.com',
        });
        expect(res.status).toBe(400);
        expect(state.lastInsert).toBeNull();
        expect(state.users).toHaveLength(0);
    });

    it('stores the normalized country code', async () => {
        const res = await register({
            username: 'erin',
            turnstileToken: 'ok',
            country: 'au',
        });
        expect(res.status).toBe(201);
        expect(state.lastInsert?.country).toBe('AU');
    });

    it('rejects a missing country without inserting', async () => {
        const res = await register({
            username: 'frank',
            turnstileToken: 'ok',
            country: undefined,
        });
        expect(res.status).toBe(400);
        expect(state.users).toHaveLength(0);
    });

    it('rejects an unknown country without inserting', async () => {
        const res = await register({
            username: 'grace',
            turnstileToken: 'ok',
            country: 'ZZ',
        });
        expect(res.status).toBe(400);
        expect(state.users).toHaveLength(0);
    });

    it('requires invite session when INVITE_KEY is set', async () => {
        const res = await register(
            { username: 'dave', turnstileToken: 'ok' },
            { INVITE_KEY: 'secret' },
        );
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'invite required' });
        expect(state.users).toHaveLength(0);
    });
});
