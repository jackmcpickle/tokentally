import {
    getDistinctModelFamilies,
    getLeaderboard,
    getProfile,
    type LeaderboardEntry,
    type LeaderboardQuery,
    type Profile,
} from '@/lib/aggregate';
import { getOrSet, READ_CACHE_TTL_SECONDS } from '@/lib/read-cache';

export function leaderboardCacheKey(query: LeaderboardQuery): string {
    return [
        'agg:lb:v1',
        query.window,
        query.metric,
        query.source ?? '',
        query.model ?? '',
        String(query.limit ?? 100),
    ].join(':');
}

export function profileCacheKey(username: string): string {
    return `agg:profile:v1:${username.toLowerCase()}`;
}

/** Drop a user's profile aggregate after ingest/history so the next read is fresh. */
export async function invalidateProfileCache(
    kv: KVNamespace,
    username: string,
): Promise<void> {
    await kv.delete(profileCacheKey(username));
}

const MODELS_CACHE_KEY = 'agg:models:v1';

function withReadCache<T>(
    kv: KVNamespace,
    key: string,
    load: () => Promise<T>,
): Promise<T> {
    return getOrSet(kv, key, READ_CACHE_TTL_SECONDS, load);
}

export async function cachedLeaderboard(
    db: D1Database,
    kv: KVNamespace,
    query: LeaderboardQuery,
    now: number,
): Promise<LeaderboardEntry[]> {
    return withReadCache(kv, leaderboardCacheKey(query), () =>
        getLeaderboard(db, query, now),
    );
}

export async function cachedProfile(
    db: D1Database,
    kv: KVNamespace,
    username: string,
): Promise<Profile | null> {
    return withReadCache(kv, profileCacheKey(username), () =>
        getProfile(db, username),
    );
}

export async function cachedDistinctModelFamilies(
    db: D1Database,
    kv: KVNamespace,
): Promise<string[]> {
    return withReadCache(kv, MODELS_CACHE_KEY, () =>
        getDistinctModelFamilies(db),
    );
}
