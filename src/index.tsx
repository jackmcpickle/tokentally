import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDistinctModels, getLeaderboard, getProfile } from '@/lib/aggregate';
import { About } from '@/pages/about';
import { Home } from '@/pages/home';
import { Layout } from '@/pages/layout';
import { ProfilePage } from '@/pages/profile';
import { Start } from '@/pages/start';
import { sub } from '@/pages/ui';
import { historyRoutes } from '@/routes/history';
import { ingestRoutes } from '@/routes/ingest';
import {
    parseMetric,
    parseSourceParam,
    parseWindow,
} from '@/routes/leaderboard';
import { leaderboardRoutes } from '@/routes/leaderboard';
import { registerRoutes } from '@/routes/register';
import type { Env } from '@/types';
// Raw text via the wrangler Text rule (see wrangler.toml). Typed by src/reporter.d.ts.
// oxlint can't see the loader-injected default; verified at build + runtime.
// eslint-disable-next-line import/default
import REPORTER_SOURCE from '../reporter/tokentally.mjs';

const VERSION = '0.1.0';

const app = new Hono<{ Bindings: Env }>();

function baseUrl(env: Env, url: string): string {
    return env.PUBLIC_BASE_URL && env.PUBLIC_BASE_URL.length > 0
        ? env.PUBLIC_BASE_URL
        : new URL(url).origin;
}

// Redirect www.* to the apex so we serve a single canonical host.
app.use('*', async (c, next) => {
    const url = new URL(c.req.url);
    if (url.hostname.startsWith('www.')) {
        url.hostname = url.hostname.slice(4);
        return c.redirect(url.toString(), 301);
    }
    return next();
});

// Public API — token goes in the Authorization header (no cookies), so reflecting
// the request origin is safe and lets third parties consume the read endpoints.
app.use(
    '/api/*',
    cors({
        origin: (origin) => origin || '*',
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
    }),
);

app.get('/api/health', (c) => c.json({ name: 'tokentally', version: VERSION }));
app.route('/api', registerRoutes);
app.route('/api', ingestRoutes);
app.route('/api', historyRoutes);
app.route('/api', leaderboardRoutes);

// Reporter script served for the copy-paste onboarding snippet.
app.get('/tokentally.mjs', (c) =>
    c.body(REPORTER_SOURCE, 200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
    }),
);

// ---- HTML pages ----
app.get('/', async (c) => {
    const window = parseWindow(c.req.query('window'));
    const metric = parseMetric(c.req.query('metric'));
    const source = parseSourceParam(c.req.query('source'));
    const modelRaw = c.req.query('model');
    const model = modelRaw && modelRaw.length > 0 ? modelRaw : undefined;
    const base = baseUrl(c.env, c.req.url);

    const [entries, models] = await Promise.all([
        getLeaderboard(
            c.env.DB,
            { window, metric, source, model, limit: 100 },
            Date.now(),
        ),
        getDistinctModels(c.env.DB),
    ]);
    return c.html(
        <Home
            base={base}
            entries={entries}
            models={models}
            window={window}
            metric={metric}
            source={source}
            model={model}
        />,
    );
});

app.get('/start', (c) => c.html(<Start base={baseUrl(c.env, c.req.url)} />));
app.get('/about', (c) => c.html(<About base={baseUrl(c.env, c.req.url)} />));

app.get('/u/:username', async (c) => {
    const base = baseUrl(c.env, c.req.url);
    const profile = await getProfile(c.env.DB, c.req.param('username'));
    if (!profile) {
        return c.html(
            <Layout
                title="Not found · TokenTally"
                base={base}
            >
                <h1>Builder not found</h1>
                <p class={sub}>
                    No one has claimed that username yet.{' '}
                    <a href="/start">Claim it →</a>
                </p>
            </Layout>,
            404,
        );
    }
    return c.html(
        <ProfilePage
            base={base}
            profile={profile}
        />,
    );
});

export default app;
