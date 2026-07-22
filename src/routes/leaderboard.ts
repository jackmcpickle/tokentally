import { Hono } from 'hono';
import { cachedLeaderboard, cachedProfile } from '@/lib/cached-aggregate';
import { isValidCountry } from '@/lib/countries';
import { apiCache } from '@/lib/page-cache';
import {
    type Env,
    isMetric,
    isSource,
    isTimeWindow,
    type Metric,
    type Source,
    type TimeWindow,
} from '@/types';

const app = new Hono<{ Bindings: Env }>();

export function parseWindow(v: string | undefined): TimeWindow {
    return isTimeWindow(v) ? v : '7d';
}
export function parseMetric(v: string | undefined): Metric {
    return isMetric(v) ? v : 'total';
}
export function parseSourceParam(v: string | undefined): Source | undefined {
    return isSource(v) ? v : undefined;
}
export function parseCountryParam(v: string | undefined): string | undefined {
    if (!v) return undefined;
    const code = v.trim().toUpperCase();
    return isValidCountry(code) ? code : undefined;
}

// GET /api/leaderboard?window=&metric=&source=&model=&limit=
app.get('/leaderboard', apiCache, async (c) => {
    const window = parseWindow(c.req.query('window'));
    const metric = parseMetric(c.req.query('metric'));
    const source = parseSourceParam(c.req.query('source'));
    const modelRaw = c.req.query('model');
    const model = modelRaw && modelRaw.length > 0 ? modelRaw : undefined;
    const country = parseCountryParam(c.req.query('country'));
    const limitRaw = Number.parseInt(c.req.query('limit') ?? '100', 10);
    const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), 500)
        : 100;

    const entries = await cachedLeaderboard(
        c.env.DB,
        c.env.RATE_LIMIT,
        { window, metric, source, model, country, limit },
        Date.now(),
    );
    return c.json({
        window,
        metric,
        source: source ?? null,
        model: model ?? null,
        country: country ?? null,
        entries,
    });
});

// GET /api/u/:username
app.get('/u/:username', apiCache, async (c) => {
    const profile = await cachedProfile(
        c.env.DB,
        c.env.RATE_LIMIT,
        c.req.param('username'),
    );
    if (!profile) return c.json({ error: 'not found' }, 404);
    return c.json(profile);
});

export { app as leaderboardRoutes };
