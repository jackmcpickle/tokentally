import { describe, expect, it, vi } from 'vitest';
import { memoryKv } from '@/__tests__/helpers/kv';
import {
    cachedDistinctModelFamilies,
    cachedLeaderboard,
    cachedProfile,
    invalidateProfileCache,
    leaderboardCacheKey,
    profileCacheKey,
} from '@/lib/cached-aggregate';

describe('cache keys', () => {
    it('leaderboard key includes filters and limit', () => {
        expect(
            leaderboardCacheKey({
                window: '7d',
                metric: 'total',
                source: 'claude_code',
                model: 'sonnet',
                limit: 100,
            }),
        ).toBe('agg:lb:v1:7d:total:claude_code:sonnet:100');
    });

    it('profile key is lowercased', () => {
        expect(profileCacheKey('Ada')).toBe('agg:profile:v1:ada');
    });
});

describe('cachedLeaderboard', () => {
    it('hits D1 once for the same query within the TTL', async () => {
        const kv = memoryKv();
        const all = vi.fn(async () => ({ results: [] }));
        const db = {
            prepare: () => ({
                bind: () => ({ all }),
            }),
        } as unknown as D1Database;

        const query = {
            window: '7d' as const,
            metric: 'total' as const,
            limit: 10,
        };
        await cachedLeaderboard(db, kv, query, Date.now());
        await cachedLeaderboard(db, kv, query, Date.now());

        expect(all).toHaveBeenCalledTimes(1);
    });
});

describe('cachedProfile', () => {
    it('does not cache a missing profile', async () => {
        const kv = memoryKv();
        const first = vi.fn(async () => null);
        const db = {
            prepare: () => ({
                bind: () => ({ first, all: async () => ({ results: [] }) }),
            }),
        } as unknown as D1Database;

        expect(await cachedProfile(db, kv, 'nobody')).toBeNull();
        expect(await cachedProfile(db, kv, 'nobody')).toBeNull();
        expect(first).toHaveBeenCalledTimes(2);
    });

    it('drops the KV entry on invalidateProfileCache', async () => {
        const kv = memoryKv();
        await kv.put(profileCacheKey('Ada'), '{"username":"Ada"}');
        await invalidateProfileCache(kv, 'Ada');
        expect(await kv.get(profileCacheKey('Ada'))).toBeNull();
    });
});

describe('cachedDistinctModelFamilies', () => {
    it('caches the model family list', async () => {
        const kv = memoryKv();
        const all = vi.fn(async () => ({
            results: [{ model: 'claude-sonnet-4-6' }],
        }));
        const db = {
            prepare: () => ({
                bind: () => ({ all }),
                all,
            }),
        } as unknown as D1Database;

        const first = await cachedDistinctModelFamilies(db, kv);
        const second = await cachedDistinctModelFamilies(db, kv);

        expect(first).toEqual(second);
        expect(all).toHaveBeenCalledTimes(1);
    });
});
