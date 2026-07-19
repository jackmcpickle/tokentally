import { describe, expect, it } from 'vitest';
import app from '@/index';
import { hashToken } from '@/lib/auth';
import type { Env } from '@/types';

const TOKEN = 'tt_test_profile_token';
const USER = {
    id: 'u1',
    username: 'alice',
    username_lower: 'alice',
    token_hash: '',
    created_at: 1,
    profile_url: null as string | null,
};

function kv(): KVNamespace {
    const store = new Map<string, string>();
    return {
        get: async (key: string) => store.get(key) ?? null,
        put: async (key: string, value: string) => {
            store.set(key, value);
        },
        delete: async (key: string) => {
            store.delete(key);
        },
        list: async () => ({
            keys: [],
            list_complete: true,
            cacheStatus: null,
        }),
        getWithMetadata: async () => ({ value: null, metadata: null }),
    } as unknown as KVNamespace;
}

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
                    if (sql.includes('token_hash')) {
                        const hash = self.binds[0];
                        if (hash === USER.token_hash) {
                            return {
                                id: USER.id,
                                username: USER.username,
                                username_lower: USER.username_lower,
                                token_hash: USER.token_hash,
                                created_at: USER.created_at,
                            } as T;
                        }
                        return null;
                    }
                    return null;
                },
                async run() {
                    if (sql.includes('UPDATE users SET profile_url')) {
                        USER.profile_url = self.binds[0] as string | null;
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

function env(): Env {
    return {
        DB: db(),
        RATE_LIMIT: kv(),
        ENVIRONMENT: 'test',
        PUBLIC_BASE_URL: 'https://tokenmaxer.quest',
        TURNSTYLE_SECRET_KEY: '',
    };
}

describe('POST /api/profile', () => {
    it('rejects missing auth', async () => {
        const res = await app.request(
            'https://tokenmaxer.quest/api/profile',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: 'https://example.com' }),
            },
            env(),
        );
        expect(res.status).toBe(401);
    });

    it('sets and clears a profile url', async () => {
        USER.token_hash = await hashToken(TOKEN);
        USER.profile_url = null;

        const setRes = await app.request(
            'https://tokenmaxer.quest/api/profile',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${TOKEN}`,
                },
                body: JSON.stringify({ url: 'https://example.com/me' }),
            },
            env(),
        );
        expect(setRes.status).toBe(200);
        expect(await setRes.json()).toEqual({
            username: 'alice',
            url: 'https://example.com/me',
        });
        expect(USER.profile_url).toBe('https://example.com/me');

        const clearRes = await app.request(
            'https://tokenmaxer.quest/api/profile',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${TOKEN}`,
                },
                body: JSON.stringify({ url: null }),
            },
            env(),
        );
        expect(clearRes.status).toBe(200);
        expect(await clearRes.json()).toEqual({
            username: 'alice',
            url: null,
        });
        expect(USER.profile_url).toBeNull();
    });

    it('rejects http urls', async () => {
        USER.token_hash = await hashToken(TOKEN);
        const res = await app.request(
            'https://tokenmaxer.quest/api/profile',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${TOKEN}`,
                },
                body: JSON.stringify({ url: 'http://example.com' }),
            },
            env(),
        );
        expect(res.status).toBe(400);
    });
});
