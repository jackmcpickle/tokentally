import { describe, expect, it, vi } from 'vitest';
import { memoryKv } from '@/__tests__/helpers/kv';
import { getOrSet } from '@/lib/read-cache';

describe('getOrSet', () => {
    it('loads once and serves the cached value afterward', async () => {
        const kv = memoryKv();
        const load = vi.fn(async () => ({ n: 1 }));

        const first = await getOrSet(kv, 'k', 600, load);
        const second = await getOrSet(kv, 'k', 600, load);

        expect(first).toEqual({ n: 1 });
        expect(second).toEqual({ n: 1 });
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('does not cache nullish results', async () => {
        const kv = memoryKv();
        const load = vi.fn(async () => null);

        expect(await getOrSet(kv, 'missing', 600, load)).toBeNull();
        expect(await getOrSet(kv, 'missing', 600, load)).toBeNull();
        expect(load).toHaveBeenCalledTimes(2);
    });
});
