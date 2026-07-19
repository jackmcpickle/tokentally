/** Minimal KV stub: always misses, so tests exercise the DB path. */
export function stubKv(): KVNamespace {
    return {
        get: async () => null,
        put: async () => undefined,
        delete: async () => undefined,
    } as unknown as KVNamespace;
}

/** In-memory KV for cache hit/miss tests. Honors `expirationTtl` when set. */
export function memoryKv(): KVNamespace {
    const store = new Map<string, { value: string; expiresAt?: number }>();
    return {
        get: async (key: string) => {
            const hit = store.get(key);
            if (!hit) return null;
            if (hit.expiresAt !== undefined && Date.now() >= hit.expiresAt) {
                store.delete(key);
                return null;
            }
            return hit.value;
        },
        put: async (
            key: string,
            value: string,
            opts?: { expirationTtl?: number },
        ) => {
            store.set(key, {
                value,
                expiresAt:
                    opts?.expirationTtl === undefined
                        ? undefined
                        : Date.now() + opts.expirationTtl * 1000,
            });
        },
        delete: async (key: string) => {
            store.delete(key);
        },
    } as unknown as KVNamespace;
}
