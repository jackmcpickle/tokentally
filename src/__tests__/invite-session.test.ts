import { describe, expect, it } from 'vitest';
import { stubKv } from '@/__tests__/helpers/kv';
import app from '@/index';
import { INVITE_COOKIE, inviteCookieToken } from '@/lib/invite';
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

function browserHeaders(extra: Record<string, string> = {}): HeadersInit {
    return {
        Accept: 'text/html',
        'Sec-Fetch-Mode': 'navigate',
        ...extra,
    };
}

function cookieFromSetCookie(setCookie: string | null): string | undefined {
    if (!setCookie) return undefined;
    const pair = setCookie.split(';')[0];
    return pair && pair.length > 0 ? pair : undefined;
}

async function unlockViaInviteUrl(
    path: string,
): Promise<{ setCookie: string | null; startHtml: string }> {
    const inviteRes = await app.request(
        `https://tokenmaxer.quest${path}`,
        { headers: browserHeaders() },
        env({ INVITE_KEY: 'secret' }),
    );
    expect(inviteRes.status).toBe(302);
    expect(inviteRes.headers.get('Location')).toBe('/');
    const setCookie = inviteRes.headers.get('Set-Cookie');
    const cookie = cookieFromSetCookie(setCookie);
    const startRes = await app.request(
        'https://tokenmaxer.quest/start',
        {
            headers: browserHeaders(cookie ? { Cookie: cookie } : {}),
        },
        env({ INVITE_KEY: 'secret' }),
    );
    return { setCookie, startHtml: await startRes.text() };
}

describe('invite session across /invite → /start', () => {
    it('sets tt_invite on valid /invite?token= and unlocks the username form on /start', async () => {
        const { setCookie, startHtml } = await unlockViaInviteUrl(
            '/invite?token=secret',
        );
        expect(setCookie).toBeTruthy();
        expect(setCookie).toContain(`${INVITE_COOKIE}=`);
        expect(setCookie).toContain(await inviteCookieToken('secret'));
        expect(startHtml).toContain('id="reg"');
        expect(startHtml).toContain('id="username"');
        expect(startHtml).not.toContain('Username claims are invite-only');
    });

    it('still accepts legacy /invite?invite= for older shared links', async () => {
        const { setCookie, startHtml } = await unlockViaInviteUrl(
            '/invite?invite=secret',
        );
        expect(setCookie).toBeTruthy();
        expect(startHtml).toContain('id="reg"');
    });

    it('does not unlock /start after /invite with a wrong token', async () => {
        const inviteRes = await app.request(
            'https://tokenmaxer.quest/invite?token=wrong',
            { headers: browserHeaders() },
            env({ INVITE_KEY: 'secret' }),
        );
        expect(inviteRes.status).toBe(302);
        expect(inviteRes.headers.get('Set-Cookie')).toBeNull();

        const startRes = await app.request(
            'https://tokenmaxer.quest/start',
            { headers: browserHeaders() },
            env({ INVITE_KEY: 'secret' }),
        );
        const html = await startRes.text();
        expect(html).toContain('Username claims are invite-only');
        expect(html).not.toContain('id="reg"');
    });

    it('legacy /start?invite= redirects through /invite?token= and still unlocks', async () => {
        const legacy = await app.request(
            'https://tokenmaxer.quest/start?invite=secret',
            { headers: browserHeaders(), redirect: 'manual' },
            env({ INVITE_KEY: 'secret' }),
        );
        expect(legacy.status).toBe(302);
        expect(legacy.headers.get('Location')).toBe('/invite?token=secret');

        const inviteRes = await app.request(
            `https://tokenmaxer.quest${legacy.headers.get('Location')}`,
            { headers: browserHeaders() },
            env({ INVITE_KEY: 'secret' }),
        );
        const cookie = cookieFromSetCookie(inviteRes.headers.get('Set-Cookie'));
        expect(cookie).toEqual(expect.any(String));
        if (!cookie) throw new Error('expected Set-Cookie from /invite');

        const startRes = await app.request(
            'https://tokenmaxer.quest/start',
            { headers: browserHeaders({ Cookie: cookie }) },
            env({ INVITE_KEY: 'secret' }),
        );
        expect(await startRes.text()).toContain('id="reg"');
    });

    it('also redirects /start?token= through /invite', async () => {
        const res = await app.request(
            'https://tokenmaxer.quest/start?token=secret',
            { headers: browserHeaders(), redirect: 'manual' },
            env({ INVITE_KEY: 'secret' }),
        );
        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('/invite?token=secret');
    });
});
