import { describe, expect, it } from 'vitest';
import {
    INVITE_COOKIE,
    inviteAllowed,
    inviteCookieToken,
    inviteSessionAllowed,
} from '@/lib/invite';

describe('inviteAllowed', () => {
    it('allows anything when no key configured', async () => {
        expect(await inviteAllowed(undefined, undefined)).toBe(true);
        expect(await inviteAllowed('', 'x')).toBe(true);
    });
    it('rejects missing or wrong key', async () => {
        expect(await inviteAllowed('secret', undefined)).toBe(false);
        expect(await inviteAllowed('secret', 'wrong')).toBe(false);
        expect(await inviteAllowed('secret', 123)).toBe(false);
    });
    it('accepts the exact key', async () => {
        expect(await inviteAllowed('secret', 'secret')).toBe(true);
    });
});

describe('invite session cookie', () => {
    it('uses a stable session cookie name', () => {
        expect(INVITE_COOKIE).toBe('tt_invite');
    });

    it('derives a stable opaque token (not the raw key)', async () => {
        const a = await inviteCookieToken('secret');
        const b = await inviteCookieToken('secret');
        expect(a).toBe(b);
        expect(a).not.toBe('secret');
        expect(a).toMatch(/^[0-9a-f]{64}$/u);
    });

    it('allows when gate is off', async () => {
        expect(await inviteSessionAllowed(undefined, undefined)).toBe(true);
        expect(await inviteSessionAllowed('', 'x')).toBe(true);
    });

    it('accepts the derived cookie and rejects others', async () => {
        const token = await inviteCookieToken('secret');
        expect(await inviteSessionAllowed('secret', token)).toBe(true);
        expect(await inviteSessionAllowed('secret', 'secret')).toBe(false);
        expect(await inviteSessionAllowed('secret', undefined)).toBe(false);
    });
});
