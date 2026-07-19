import { describe, expect, it } from 'vitest';
import { inviteAllowed } from '../lib/invite';

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
