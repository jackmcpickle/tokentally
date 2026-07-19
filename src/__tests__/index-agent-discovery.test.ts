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

function env(over: Partial<Env> = {}): Env {
    return {
        DB: emptyDb(),
        RATE_LIMIT: stubKv(),
        ENVIRONMENT: 'test',
        PUBLIC_BASE_URL: 'https://tokenmaxer.quest',
        TURNSTYLE_SECRET_KEY: '',
        ...over,
    };
}

// Covers the real app wiring in src/index.tsx, not just the markdown/HTML
// helpers in isolation: content negotiation on `/about` must set discovery
// headers (Link, X-Llms-Txt, Vary) on both the HTML and Markdown branches.
describe('GET /about content negotiation (real app)', () => {
    it('serves HTML with discovery headers when Accept: text/html', async () => {
        const res = await app.request(
            'https://tokenmaxer.quest/about',
            { headers: { Accept: 'text/html' } },
            env(),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toMatch(/text\/html/u);
        expect(res.headers.get('Vary')).toContain('Accept');
        expect(res.headers.get('Vary')).toContain('Sec-Fetch-Mode');
        expect(res.headers.get('Link')).toContain('/llms.txt');
        expect(res.headers.get('X-Llms-Txt')).toBe('/llms.txt');
    });

    it('serves Markdown when Accept: */* without Sec-Fetch-Mode', async () => {
        const res = await app.request(
            'https://tokenmaxer.quest/about',
            { headers: { Accept: '*/*' } },
            env(),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toMatch(/text\/markdown/u);
    });
});
