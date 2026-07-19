import { describe, expect, it } from 'vitest';
import { stubKv } from '@/__tests__/helpers/kv';
import app from '@/index';
import type { Env } from '@/types';

function emptyDb(): D1Database {
    const empty = { results: [] as unknown[] };
    return {
        prepare() {
            return {
                bind() {
                    return this;
                },
                all: async () => empty,
                first: async () => null,
            };
        },
    } as unknown as D1Database;
}

function env(): Env {
    return {
        DB: emptyDb(),
        RATE_LIMIT: stubKv(),
        ENVIRONMENT: 'test',
        PUBLIC_BASE_URL: 'https://tokenmaxer.quest',
        TURNSTYLE_SECRET_KEY: '',
    };
}

describe('public read Cache-Control', () => {
    it('sets max-age=600 on the dashboard', async () => {
        const res = await app.request(
            'https://tokenmaxer.quest/',
            { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' } },
            env(),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toMatch(/max-age=600/u);
    });

    it('sets max-age=600 on /api/leaderboard', async () => {
        const res = await app.request(
            'https://tokenmaxer.quest/api/leaderboard',
            {},
            env(),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toMatch(/max-age=600/u);
    });

    it('reflects Origin on /api/leaderboard CORS', async () => {
        const res = await app.request(
            'https://tokenmaxer.quest/api/leaderboard',
            { headers: { Origin: 'https://example.com' } },
            env(),
        );
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
            'https://example.com',
        );
        expect(res.headers.get('Vary') ?? '').toMatch(/Origin/iu);
    });

    it('does not set Cache-Control on missing profile HTML', async () => {
        const res = await app.request(
            'https://tokenmaxer.quest/u/nobody-here',
            { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' } },
            env(),
        );
        expect(res.status).toBe(404);
        expect(res.headers.get('Cache-Control')).toBeNull();
    });
});
