import type { MiddlewareHandler } from 'hono';
import { cache } from 'hono/cache';
import { READ_CACHE_TTL_SECONDS } from '@/lib/read-cache';

const CACHE_CONTROL = `public, max-age=${READ_CACHE_TTL_SECONDS}`;

/**
 * Cache API when available (Cloudflare Workers). Always sets Cache-Control so
 * clients/CDNs can reuse the response even when `caches` is missing (tests).
 */
function createCacheMiddleware(options: {
    cacheName: string;
    vary?: string[];
}): MiddlewareHandler {
    const varyHeader = options.vary?.join(', ');
    const honoCache = cache({
        cacheName: options.cacheName,
        cacheControl: CACHE_CONTROL,
        ...(options.vary ? { vary: options.vary } : {}),
        onCacheNotAvailable: false,
    });

    return async (c, next) => {
        if ('caches' in globalThis) {
            return honoCache(c, next);
        }
        await next();
        if (c.res.status === 200 && !c.res.headers.has('Cache-Control')) {
            c.header('Cache-Control', CACHE_CONTROL);
        }
        if (varyHeader && !c.res.headers.has('Vary')) {
            c.header('Vary', varyHeader);
        }
    };
}

export const pageCache = createCacheMiddleware({
    cacheName: 'tokentally-pages',
    vary: ['Accept', 'Sec-Fetch-Mode'],
});

export const apiCache = createCacheMiddleware({
    cacheName: 'tokentally-api',
    // Reflects request Origin on ACAO; must not reuse another site's CORS headers.
    vary: ['Origin'],
});
