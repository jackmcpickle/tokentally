import { describe, expect, it } from 'vitest';
import { extractBearer, generateToken, hashToken, newId } from '@/lib/auth';

describe('generateToken', () => {
    it('is prefixed and unique', () => {
        const a = generateToken();
        const b = generateToken();
        expect(a.startsWith('tt_')).toBe(true);
        expect(a).not.toBe(b);
    });
});

describe('newId', () => {
    it('is 32 hex chars and unique', () => {
        expect(newId()).toMatch(/^[0-9a-f]{32}$/);
        expect(newId()).not.toBe(newId());
    });
});

describe('hashToken', () => {
    it('is deterministic sha-256 hex', async () => {
        const h1 = await hashToken('tt_abc');
        const h2 = await hashToken('tt_abc');
        expect(h1).toBe(h2);
        expect(h1).toMatch(/^[0-9a-f]{64}$/);
        expect(await hashToken('tt_xyz')).not.toBe(h1);
    });
});

describe('extractBearer', () => {
    it('parses a bearer header', () => {
        expect(extractBearer('Bearer tt_123')).toBe('tt_123');
        expect(extractBearer('bearer   tt_123  ')).toBe('tt_123');
    });
    it('returns null for missing/malformed', () => {
        expect(extractBearer(null)).toBeNull();
        expect(extractBearer('Basic xyz')).toBeNull();
        expect(extractBearer('')).toBeNull();
    });
});
