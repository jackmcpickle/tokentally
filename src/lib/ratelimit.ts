/**
 * Fixed-window rate limit backed by KV. Coarse (KV writes are eventually
 * consistent) but plenty for honor-system abuse control.
 */
export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
}

export async function rateLimit(
    kv: KVNamespace,
    key: string,
    max: number,
    windowSeconds: number,
): Promise<RateLimitResult> {
    const existing = await kv.get(key);
    const count = existing ? Number.parseInt(existing, 10) : 0;
    if (Number.isFinite(count) && count >= max) {
        return { allowed: false, remaining: 0 };
    }
    const next = (Number.isFinite(count) ? count : 0) + 1;
    await kv.put(key, String(next), { expirationTtl: windowSeconds });
    return { allowed: true, remaining: Math.max(0, max - next) };
}
