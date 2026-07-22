/** Default TTL for leaderboard / profile DB reads. */
export const READ_CACHE_TTL_SECONDS = 600;

/** TTL for hackathon board reads (5 minutes). */
export const HACKATHON_CACHE_TTL_SECONDS = 300;

/**
 * KV-backed get-or-compute. `null` / `undefined` results are not stored so
 * missing profiles stay fresh for newly claimed usernames.
 */
export async function getOrSet<T>(
    kv: KVNamespace,
    key: string,
    ttlSeconds: number,
    load: () => Promise<T>,
): Promise<T> {
    const cached = await kv.get(key);
    if (cached !== null) {
        return JSON.parse(cached) as T;
    }
    const value = await load();
    if (value !== null && value !== undefined) {
        await kv.put(key, JSON.stringify(value), {
            expirationTtl: ttlSeconds,
        });
    }
    return value;
}
