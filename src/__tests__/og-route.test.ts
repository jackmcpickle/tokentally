import { describe, expect, it } from 'vitest';
import { stubKv } from '@/__tests__/helpers/kv';
import app from '@/index';
import type { Env } from '@/types';

const USER = {
    id: 'u1',
    username: 'alice',
    created_at: 1,
    profile_url: null as string | null,
};

function profileDb(): D1Database {
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
                        sql.includes('FROM users WHERE username_lower') ||
                        sql.includes('SELECT id, username, created_at')
                    ) {
                        if (
                            String(self.binds[0]).toLowerCase() ===
                            USER.username
                        ) {
                            if (sql.includes('SELECT id FROM users')) {
                                return { id: USER.id } as T;
                            }
                            return {
                                id: USER.id,
                                username: USER.username,
                                created_at: USER.created_at,
                                profile_url: USER.profile_url,
                            } as T;
                        }
                        return null;
                    }
                    if (sql.includes('COUNT(*) AS ahead')) {
                        return { ahead: 2 } as T;
                    }
                    return null;
                },
                async all() {
                    if (sql.includes('FROM session_usage')) {
                        return {
                            results: [
                                {
                                    username: USER.username,
                                    user_id: USER.id,
                                    source: 'claude_code',
                                    model: 'claude-sonnet-4-6',
                                    input_tokens: 1000,
                                    output_tokens: 500,
                                    cache_read_tokens: 0,
                                    cache_creation_tokens: 0,
                                    reasoning_tokens: 0,
                                    sessions: 3,
                                },
                            ],
                        };
                    }
                    return { results: [] };
                },
            };
            return self;
        },
    } as unknown as D1Database;
}

function emptyDb(): D1Database {
    return {
        prepare() {
            return {
                bind() {
                    return this;
                },
                first: async () => null,
                all: async () => ({ results: [] }),
            };
        },
    } as unknown as D1Database;
}

function env(db: D1Database = profileDb()): Env {
    return {
        DB: db,
        RATE_LIMIT: stubKv(),
        ENVIRONMENT: 'test',
        PUBLIC_BASE_URL: 'https://tokenmaxer.quest',
        TURNSTYLE_SECRET_KEY: '',
    };
}

describe('GET /u/:username/og.png', () => {
    it('returns a PNG with 10-minute cache for a known user', async () => {
        const res = await app.request(
            'https://tokenmaxer.quest/u/alice/og.png',
            {},
            env(),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toMatch(/image\/png/u);
        expect(res.headers.get('Cache-Control')).toMatch(/max-age=600/u);
        const buf = new Uint8Array(await res.arrayBuffer());
        expect(buf[0]).toBe(0x89);
        expect(buf[1]).toBe(0x50); // P
        expect(buf[2]).toBe(0x4e); // N
        expect(buf[3]).toBe(0x47); // G
    });

    it('returns 404 for an unknown user', async () => {
        const res = await app.request(
            'https://tokenmaxer.quest/u/nobody/og.png',
            {},
            env(emptyDb()),
        );
        expect(res.status).toBe(404);
        expect(res.headers.get('Cache-Control')).toBeNull();
    });
});

describe('profile HTML og:image', () => {
    it('points at the dynamic share card', async () => {
        const res = await app.request(
            'https://tokenmaxer.quest/u/alice',
            { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' } },
            env(),
        );
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain(
            'property="og:image" content="https://tokenmaxer.quest/u/alice/og.png"',
        );
        expect(html).toContain('id="share-card"');
        expect(html).toContain('data-share="copy"');
    });
});
