import { describe, expect, it } from 'vitest';
import { stubKv } from '@/__tests__/helpers/kv';
import { inviteCookieToken } from '@/lib/invite';
import { agentPageRoutes } from '@/routes/agent-pages';
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

describe('agentPageRoutes', () => {
    it('serves llms.txt as text/plain', async () => {
        const res = await agentPageRoutes.request(
            'https://tokenmaxer.quest/llms.txt',
            {},
            env(),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toMatch(/text\/plain/u);
        const body = await res.text();
        expect(body).toContain('# tokenmaxer.quest');
        expect(body).toContain('/index.md');
    });

    it('serves llms-full.txt as text/plain', async () => {
        const res = await agentPageRoutes.request(
            'https://tokenmaxer.quest/llms-full.txt',
            {},
            env(),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toMatch(/text\/plain/u);
        const body = await res.text();
        expect(body).toContain('# tokenmaxer.quest — full corpus');
        expect(body).toContain('# About tokenmaxer.quest');
    });

    it('serves about.md as markdown', async () => {
        const res = await agentPageRoutes.request(
            'https://tokenmaxer.quest/about.md',
            {},
            env(),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toMatch(/text\/markdown/u);
        expect(await res.text()).toContain('# About tokenmaxer.quest');
    });

    it('serves pricing.md as markdown', async () => {
        const res = await agentPageRoutes.request(
            'https://tokenmaxer.quest/pricing.md',
            {},
            env(),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toMatch(/text\/markdown/u);
        expect(await res.text()).toContain('# Reference pricing');
    });

    it('rejects start.md without invite when gate on', async () => {
        const res = await agentPageRoutes.request(
            'https://tokenmaxer.quest/start.md',
            {},
            env({ INVITE_KEY: 'secret' }),
        );
        expect(res.status).toBe(403);
        expect(await res.text()).toContain('Invite required');
    });

    it('allows start.md with valid invite cookie', async () => {
        const token = await inviteCookieToken('secret');
        const res = await agentPageRoutes.request(
            'https://tokenmaxer.quest/start.md',
            { headers: { Cookie: `tt_invite=${token}` } },
            env({ INVITE_KEY: 'secret' }),
        );
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('# Get started');
    });

    it('serves start.md without an invite check when the gate is off', async () => {
        const res = await agentPageRoutes.request(
            'https://tokenmaxer.quest/start.md',
            {},
            env(),
        );
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('# Get started');
    });

    it('serves index.md with empty table', async () => {
        const res = await agentPageRoutes.request(
            'https://tokenmaxer.quest/index.md',
            {},
            env(),
        );
        expect(res.status).toBe(200);
        const body = await res.text();
        expect(body).toContain('| Rank |');
        expect(body).toMatch(/7d|7 days/iu);
    });

    it('404s unknown profile.md', async () => {
        const res = await agentPageRoutes.request(
            'https://tokenmaxer.quest/u/nobody.md',
            {},
            env(),
        );
        expect(res.status).toBe(404);
        expect(await res.text()).toMatch(/not found/iu);
    });
});
