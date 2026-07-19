import { Hono } from 'hono';
import { cachedProfile, cachedProfileWindow } from '@/lib/cached-aggregate';
import { ogCache } from '@/lib/page-cache';
import { READ_CACHE_TTL_SECONDS } from '@/lib/read-cache';
import { buildShareCardPayload, buildShareCardSvg } from '@/lib/share-card';
import { renderShareCardPng } from '@/lib/share-card-png';
import type { Env } from '@/types';

export const ogRoutes = new Hono<{ Bindings: Env }>();

ogRoutes.get('/u/:username/og.png', ogCache, async (c) => {
    const username = c.req.param('username');
    const { DB, RATE_LIMIT } = c.env;
    const now = Date.now();
    const [profile, last7d] = await Promise.all([
        cachedProfile(DB, RATE_LIMIT, username),
        cachedProfileWindow(DB, RATE_LIMIT, username, '7d', now),
    ]);
    if (!profile || !last7d) {
        return c.text('Not found', 404);
    }

    const png = await renderShareCardPng(
        buildShareCardSvg(buildShareCardPayload(profile, last7d)),
    );
    return new Response(png, {
        status: 200,
        headers: {
            'Content-Type': 'image/png',
            'Cache-Control': `public, max-age=${READ_CACHE_TTL_SECONDS}`,
        },
    });
});
