import { describe, expect, it, vi } from 'vitest';
import { memoryKv } from '@/__tests__/helpers/kv';
import { getHackathonLeaderboard } from '@/lib/aggregate';
import {
    cachedHackathonLeaderboard,
    hackathonLeaderboardCacheKey,
    invalidateHackathonCache,
} from '@/lib/cached-aggregate';
import { slugify } from '@/lib/slug';
import {
    validateHackathonName,
    validateHackathonRange,
    validateModelFamily,
} from '@/lib/validate';

interface Row {
    username: string;
    user_id: string;
    source: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    reasoning_tokens: number;
    sessions: number;
}

function row(partial: Partial<Row> & Pick<Row, 'user_id' | 'model'>): Row {
    return {
        username: partial.user_id,
        source: 'claude_code',
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        reasoning_tokens: 0,
        sessions: 1,
        ...partial,
    };
}

function dbReturning(rows: Row[], onQuery?: (binds: unknown[]) => void) {
    return {
        prepare: () => ({
            bind: (...binds: unknown[]) => {
                onQuery?.(binds);
                return { all: async () => ({ results: rows }) };
            },
        }),
    } as unknown as D1Database;
}

describe('getHackathonLeaderboard', () => {
    it('returns [] and skips the DB when there are no members', async () => {
        const query = vi.fn();
        const db = dbReturning([], query);
        const res = await getHackathonLeaderboard(db, {
            metric: 'cost',
            startAt: 0,
            endAt: 100,
            memberIds: [],
        });
        expect(res).toEqual([]);
        expect(query).not.toHaveBeenCalled();
    });

    it('binds the range and member ids', async () => {
        let seen: unknown[] = [];
        const db = dbReturning([], (b) => {
            seen = b;
        });
        await getHackathonLeaderboard(db, {
            metric: 'total',
            startAt: 5,
            endAt: 9,
            memberIds: ['a', 'b'],
        });
        expect(seen).toEqual([5, 9, 'a', 'b']);
    });

    it('ranks members by the metric and excludes other model families', async () => {
        const db = dbReturning([
            row({ user_id: 'a', model: 'claude-sonnet-4', output_tokens: 10 }),
            row({ user_id: 'b', model: 'claude-opus-4', output_tokens: 999 }),
            row({ user_id: 'c', model: 'claude-sonnet-5', output_tokens: 50 }),
        ]);
        const res = await getHackathonLeaderboard(db, {
            metric: 'output',
            startAt: 0,
            endAt: 100,
            memberIds: ['a', 'b', 'c'],
            model: 'sonnet',
        });
        expect(res.map((e) => e.username)).toEqual(['c', 'a']);
        expect(res[0]?.rank).toBe(1);
    });
});

describe('hackathon cache', () => {
    it('key is namespaced by slug and metric', () => {
        expect(hackathonLeaderboardCacheKey('Spring-Sprint', 'cost')).toBe(
            'agg:hack:v1:spring-sprint:cost',
        );
    });

    it('hits D1 once within the TTL then serves from cache', async () => {
        const kv = memoryKv();
        const all = vi.fn(async () => ({ results: [] as Row[] }));
        const db = {
            prepare: () => ({ bind: () => ({ all }) }),
        } as unknown as D1Database;
        const q = {
            metric: 'cost' as const,
            startAt: 0,
            endAt: 100,
            memberIds: ['a'],
        };
        await cachedHackathonLeaderboard(db, kv, 'sprint', q);
        await cachedHackathonLeaderboard(db, kv, 'sprint', q);
        expect(all).toHaveBeenCalledTimes(1);
    });

    it('invalidation clears every metric variant', async () => {
        const kv = memoryKv();
        await Promise.all(
            (['total', 'input', 'output', 'cached', 'cost'] as const).map((m) =>
                kv.put(hackathonLeaderboardCacheKey('sprint', m), '[]'),
            ),
        );
        await invalidateHackathonCache(kv, 'sprint');
        expect(
            await kv.get(hackathonLeaderboardCacheKey('sprint', 'cost')),
        ).toBe(null);
        expect(
            await kv.get(hackathonLeaderboardCacheKey('sprint', 'total')),
        ).toBe(null);
    });
});

describe('slugify', () => {
    it('lowercases and dashes non-alphanumerics', () => {
        expect(slugify('Spring Token Sprint!')).toBe('spring-token-sprint');
    });
    it('trims leading/trailing dashes', () => {
        expect(slugify('  --Hi--  ')).toBe('hi');
    });
});

describe('hackathon validation', () => {
    it('accepts a reasonable name', () => {
        expect(validateHackathonName('Sprint')).toEqual({
            ok: true,
            value: 'Sprint',
        });
    });
    it('rejects short names', () => {
        expect(validateHackathonName('a').ok).toBe(false);
    });

    it('requires end after start', () => {
        expect(validateHackathonRange(10, 5).ok).toBe(false);
        expect(validateHackathonRange(5, 10)).toEqual({
            ok: true,
            value: { startAt: 5, endAt: 10 },
        });
    });
    it('rejects absurdly long ranges', () => {
        expect(validateHackathonRange(0, 2 * 366 * 86_400_000).ok).toBe(false);
    });

    it('treats empty model family as all models', () => {
        expect(validateModelFamily('', ['sonnet'])).toEqual({
            ok: true,
            value: null,
        });
    });
    it('rejects an unknown family', () => {
        expect(validateModelFamily('gpt', ['sonnet']).ok).toBe(false);
    });
    it('accepts a known family', () => {
        expect(validateModelFamily('sonnet', ['sonnet'])).toEqual({
            ok: true,
            value: 'sonnet',
        });
    });
});
