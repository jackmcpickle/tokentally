import type { Context } from 'hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AGENT_PAGE_VARY, isBrowserRequest } from '@/lib/agent-markdown';
import { baseUrl } from '@/lib/base-url';
import {
    cachedDistinctModelFamilies,
    cachedLeaderboard,
    cachedProfile,
} from '@/lib/cached-aggregate';
import {
    estimateImpact,
    impactValue,
    parseImpactMetric,
    parseImpactRegion,
    parseImpactScenario,
} from '@/lib/impact';
import {
    getInviteCookie,
    inviteAllowed,
    inviteSessionAllowed,
    setInviteCookie,
} from '@/lib/invite';
import { pageCache } from '@/lib/page-cache';
import { About } from '@/pages/about';
import { Footprint } from '@/pages/footprint';
import type { FootprintEntry } from '@/pages/footprint-chart';
import { Home } from '@/pages/home';
import { Layout } from '@/pages/layout';
import { Pricing } from '@/pages/pricing';
import { ProfilePage } from '@/pages/profile';
import { Start } from '@/pages/start';
import { sub } from '@/pages/ui';
import {
    agentPageRoutes,
    serveAboutMarkdown,
    serveHomeMarkdown,
    servePricingMarkdown,
    serveProfileMarkdown,
    serveStartMarkdown,
} from '@/routes/agent-pages';
import { historyRoutes } from '@/routes/history';
import { ingestRoutes } from '@/routes/ingest';
import {
    parseMetric,
    parseSourceParam,
    parseWindow,
} from '@/routes/leaderboard';
import { leaderboardRoutes } from '@/routes/leaderboard';
import { ogRoutes } from '@/routes/og';
import { profileRoutes } from '@/routes/profile';
import { registerRoutes } from '@/routes/register';
import type { Env } from '@/types';
// Raw text via the wrangler Text rule (see wrangler.toml). Typed by src/reporter.d.ts.
// oxlint can't see the loader-injected default; verified at build + runtime.
// eslint-disable-next-line import/default
import REPORTER_SOURCE from '../reporter/tokentally.mjs';

const VERSION = '0.2.0';

const app = new Hono<{ Bindings: Env }>();

// Redirect www.* to the apex so we serve a single canonical host.
app.use('*', async (c, next) => {
    const url = new URL(c.req.url);
    if (url.hostname.startsWith('www.')) {
        url.hostname = url.hostname.slice(4);
        return c.redirect(url.toString(), 301);
    }
    return next();
});

// Markdown/plaintext pages for agents: /llms.txt, /llms-full.txt, /about.md,
// /pricing.md, /start.md, /index.md, /u/:username.md. Distinct literal paths,
// so this never shadows /api/*.
app.route('/', agentPageRoutes);

function withAgentDiscoveryHeaders(c: Context<{ Bindings: Env }>): void {
    c.header('Link', '</llms.txt>; rel="describedby"');
    c.header('X-Llms-Txt', '/llms.txt');
    c.header('Vary', AGENT_PAGE_VARY);
}

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

app.get('/api/health', (c) => c.json({ name: 'tokenmaxer', version: VERSION }));
app.route('/api', registerRoutes);
app.route('/api', ingestRoutes);
app.route('/api', historyRoutes);
app.route('/api', leaderboardRoutes);
app.route('/api', profileRoutes);

// Reporter script served for the copy-paste onboarding snippet.
app.get('/tokentally.mjs', (c) =>
    c.body(REPORTER_SOURCE, 200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
    }),
);

// Browsers still request /favicon.ico by default; SVG lives in public/.
app.get('/favicon.ico', (c) => c.redirect('/favicon.svg', 302));

// Dynamic profile OG images — before HTML `/u/:username`.
app.route('/', ogRoutes);

// ---- HTML pages ----
app.get('/', pageCache, async (c) => {
    if (!isBrowserRequest(c.req.raw)) return serveHomeMarkdown(c);

    const window = parseWindow(c.req.query('window'));
    const metric = parseMetric(c.req.query('metric'));
    const source = parseSourceParam(c.req.query('source'));
    const modelRaw = c.req.query('model');
    const model = modelRaw && modelRaw.length > 0 ? modelRaw : undefined;
    const base = baseUrl(c.env, c.req.url);

    const [entries, models] = await Promise.all([
        cachedLeaderboard(
            c.env.DB,
            c.env.RATE_LIMIT,
            { window, metric, source, model, limit: 100 },
            Date.now(),
        ),
        cachedDistinctModelFamilies(c.env.DB, c.env.RATE_LIMIT),
    ]);
    withAgentDiscoveryHeaders(c);
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

// Shared invite link: `/invite?token=<KEY>` sets a session cookie, then home.
// Legacy `/invite?invite=` and `/start?invite=` still work.
app.get('/invite', async (c) => {
    // Prefer non-empty `token`; empty `?token=` falls through to legacy `invite`.
    const provided = c.req.query('token') || c.req.query('invite') || '';
    // Cookie only when the gate is on and the key matched (empty provided fails).
    if (c.env.INVITE_KEY && (await inviteAllowed(c.env.INVITE_KEY, provided))) {
        await setInviteCookie(c, c.env.INVITE_KEY);
    }
    return c.redirect('/', 302);
});

app.get('/start', async (c) => {
    // Legacy claim URLs: bounce through /invite so the session cookie is set.
    const key = c.req.query('token') ?? c.req.query('invite');
    if (key !== undefined) {
        return c.redirect(
            key.length > 0
                ? `/invite?token=${encodeURIComponent(key)}`
                : '/invite',
            302,
        );
    }
    if (!isBrowserRequest(c.req.raw)) return serveStartMarkdown(c);
    const invited = await inviteSessionAllowed(
        c.env.INVITE_KEY,
        getInviteCookie(c),
    );
    withAgentDiscoveryHeaders(c);
    return c.html(
        <Start
            base={baseUrl(c.env, c.req.url)}
            invited={invited}
        />,
    );
});
app.get('/about', async (c) => {
    if (!isBrowserRequest(c.req.raw)) return serveAboutMarkdown(c);
    withAgentDiscoveryHeaders(c);
    return c.html(<About base={baseUrl(c.env, c.req.url)} />);
});

app.get('/footprint', pageCache, async (c) => {
    const window = parseWindow(c.req.query('window'));
    const metric = parseImpactMetric(c.req.query('metric'));
    const scenario = parseImpactScenario(c.req.query('scenario'));
    const region = parseImpactRegion(c.req.query('region'));
    const source = parseSourceParam(c.req.query('source'));
    const modelRaw = c.req.query('model');
    const model = modelRaw && modelRaw.length > 0 ? modelRaw : undefined;
    const base = baseUrl(c.env, c.req.url);

    // Fetch with token metric so cache keys stay shared with Home; re-rank by impact.
    const [rawEntries, models] = await Promise.all([
        cachedLeaderboard(
            c.env.DB,
            c.env.RATE_LIMIT,
            { window, metric: 'total', source, model, limit: 100 },
            Date.now(),
        ),
        cachedDistinctModelFamilies(c.env.DB, c.env.RATE_LIMIT),
    ]);

    const ranked: FootprintEntry[] = rawEntries
        .map((e) => ({
            username: e.username,
            sessions: e.sessions,
            grand_total: e.grand_total,
            impact: estimateImpact(e.grand_total, scenario, region),
        }))
        .sort(
            (a, b) =>
                impactValue(b.impact, metric) - impactValue(a.impact, metric),
        )
        .map((e, i) => ({ ...e, rank: i + 1 }));

    withAgentDiscoveryHeaders(c);
    return c.html(
        <Footprint
            base={base}
            entries={ranked}
            models={models}
            window={window}
            metric={metric}
            scenario={scenario}
            region={region}
            source={source}
            model={model}
        />,
    );
});

app.get('/pricing', async (c) => {
    if (!isBrowserRequest(c.req.raw)) return servePricingMarkdown(c);
    withAgentDiscoveryHeaders(c);
    return c.html(<Pricing base={baseUrl(c.env, c.req.url)} />);
});

app.get('/u/:username', pageCache, async (c) => {
    if (!isBrowserRequest(c.req.raw)) return serveProfileMarkdown(c);
    withAgentDiscoveryHeaders(c);
    const base = baseUrl(c.env, c.req.url);
    const profile = await cachedProfile(
        c.env.DB,
        c.env.RATE_LIMIT,
        c.req.param('username'),
    );
    if (!profile) {
        return c.html(
            <Layout
                title="Not found · tokenmaxer.quest"
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
