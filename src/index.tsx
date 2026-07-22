import type { Context } from 'hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AGENT_PAGE_VARY, isBrowserRequest } from '@/lib/agent-markdown';
import { baseUrl } from '@/lib/base-url';
import {
    cachedDistinctCountries,
    cachedDistinctModelFamilies,
    cachedHackathonLeaderboard,
    cachedLeaderboard,
    cachedProfile,
    invalidateHackathonCache,
} from '@/lib/cached-aggregate';
import {
    getHackathonBySlug,
    hackathonState,
    listHackathonsByHost,
    listMembers,
    memberIds,
} from '@/lib/hackathon';
import { addMember } from '@/lib/hackathon';
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
import { consumePendingSession, setSessionCookie } from '@/lib/session';
import { currentUser } from '@/lib/web-auth';
import { About } from '@/pages/about';
import { Footprint } from '@/pages/footprint';
import type { FootprintEntry } from '@/pages/footprint-chart';
import { HackathonPage, type ViewerRole } from '@/pages/hackathon';
import { HackathonMine } from '@/pages/hackathon-mine';
import { HackathonNew } from '@/pages/hackathon-new';
import { Home } from '@/pages/home';
import { Layout } from '@/pages/layout';
import { Login } from '@/pages/login';
import { Pricing } from '@/pages/pricing';
import { Privacy } from '@/pages/privacy';
import { ProfilePage } from '@/pages/profile';
import { Start } from '@/pages/start';
import { sub } from '@/pages/ui';
import {
    agentPageRoutes,
    serveAboutMarkdown,
    serveHomeMarkdown,
    servePricingMarkdown,
    servePrivacyMarkdown,
    serveProfileMarkdown,
    serveStartMarkdown,
} from '@/routes/agent-pages';
import { hackathonRoutes } from '@/routes/hackathon';
import { historyRoutes } from '@/routes/history';
import { ingestRoutes } from '@/routes/ingest';
import {
    parseCountryParam,
    parseMetric,
    parseSourceParam,
    parseWindow,
} from '@/routes/leaderboard';
import { leaderboardRoutes } from '@/routes/leaderboard';
import { ogRoutes } from '@/routes/og';
import { profileRoutes } from '@/routes/profile';
import { registerRoutes } from '@/routes/register';
import { sessionRoutes } from '@/routes/session';
import { type Metric, type Env, isMetric } from '@/types';
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
app.route('/api', sessionRoutes);
app.route('/api', hackathonRoutes);

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
    const country = parseCountryParam(c.req.query('country'));
    const base = baseUrl(c.env, c.req.url);

    const [entries, models, countries] = await Promise.all([
        cachedLeaderboard(
            c.env.DB,
            c.env.RATE_LIMIT,
            { window, metric, source, model, country, limit: 100 },
            Date.now(),
        ),
        cachedDistinctModelFamilies(c.env.DB, c.env.RATE_LIMIT),
        cachedDistinctCountries(c.env.DB, c.env.RATE_LIMIT),
    ]);
    withAgentDiscoveryHeaders(c);
    return c.html(
        <Home
            base={base}
            entries={entries}
            models={models}
            countries={countries}
            window={window}
            metric={metric}
            source={source}
            model={model}
            country={country}
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

app.get('/privacy', async (c) => {
    if (!isBrowserRequest(c.req.raw)) return servePrivacyMarkdown(c);
    withAgentDiscoveryHeaders(c);
    return c.html(<Privacy base={baseUrl(c.env, c.req.url)} />);
});

app.get('/footprint', pageCache, async (c) => {
    const window = parseWindow(c.req.query('window'));
    const metric = parseImpactMetric(c.req.query('metric'));
    const scenario = parseImpactScenario(c.req.query('scenario'));
    const region = parseImpactRegion(c.req.query('region'));
    const source = parseSourceParam(c.req.query('source'));
    const modelRaw = c.req.query('model');
    const model = modelRaw && modelRaw.length > 0 ? modelRaw : undefined;
    const country = parseCountryParam(c.req.query('country'));
    const base = baseUrl(c.env, c.req.url);

    // Fetch with token metric so cache keys stay shared with Home; re-rank by impact.
    const [rawEntries, models, countries] = await Promise.all([
        cachedLeaderboard(
            c.env.DB,
            c.env.RATE_LIMIT,
            { window, metric: 'total', source, model, country, limit: 100 },
            Date.now(),
        ),
        cachedDistinctModelFamilies(c.env.DB, c.env.RATE_LIMIT),
        cachedDistinctCountries(c.env.DB, c.env.RATE_LIMIT),
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
            countries={countries}
            window={window}
            metric={metric}
            scenario={scenario}
            region={region}
            source={source}
            model={model}
            country={country}
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

// ---- Auth + Hackathons ----

// Magic-URL exchange: consume the single-use token, set the durable cookie.
app.get('/auth', async (c) => {
    const pendingId = c.req.query('s');
    if (!pendingId) return c.redirect('/login', 302);
    const sessionId = await consumePendingSession(
        c.env.DB,
        c.env.RATE_LIMIT,
        pendingId,
        Date.now(),
    );
    if (!sessionId) {
        return c.html(
            <Layout
                title="Login expired · tokenmaxer.quest"
                base={baseUrl(c.env, c.req.url)}
            >
                <h1>Login link expired</h1>
                <p class={sub}>
                    Run <code>npx tokenmaxer login</code> again for a fresh
                    link.
                </p>
            </Layout>,
            400,
        );
    }
    setSessionCookie(c, sessionId);
    const next = c.req.query('next');
    return c.redirect(next && next.startsWith('/') ? next : '/h/mine', 302);
});

app.get('/login', (c) => {
    const next = c.req.query('next');
    return c.html(
        <Login
            base={baseUrl(c.env, c.req.url)}
            next={next && next.startsWith('/') ? next : undefined}
        />,
    );
});

app.get('/h/new', async (c) => {
    const user = await currentUser(c);
    const base = baseUrl(c.env, c.req.url);
    if (!user) return c.redirect('/login?next=/h/new', 302);
    const models = await cachedDistinctModelFamilies(
        c.env.DB,
        c.env.RATE_LIMIT,
    );
    return c.html(
        <HackathonNew
            base={base}
            username={user.username}
            models={models}
        />,
    );
});

app.get('/h/mine', async (c) => {
    const user = await currentUser(c);
    const base = baseUrl(c.env, c.req.url);
    if (!user) return c.redirect('/login?next=/h/mine', 302);
    const hackathons = await listHackathonsByHost(c.env.DB, user.id);
    return c.html(
        <HackathonMine
            base={base}
            username={user.username}
            hackathons={hackathons}
        />,
    );
});

// Self-join via the shared link: join server-side then bounce to the board.
app.get('/h/:slug/join', async (c) => {
    const slug = c.req.param('slug');
    const user = await currentUser(c);
    if (!user) return c.redirect(`/login?next=/h/${slug}/join`, 302);
    const h = await getHackathonBySlug(c.env.DB, slug);
    if (!h) return c.notFound();
    await addMember(c.env.DB, h.id, user.id, Date.now());
    await invalidateHackathonCache(c.env.RATE_LIMIT, h.slug);
    return c.redirect(`/h/${h.slug}`, 302);
});

app.get('/h/:slug', async (c) => {
    const base = baseUrl(c.env, c.req.url);
    const h = await getHackathonBySlug(c.env.DB, c.req.param('slug'));
    if (!h) {
        return c.html(
            <Layout
                title="Hackathon not found · tokenmaxer.quest"
                base={base}
            >
                <h1>Hackathon not found</h1>
                <p class={sub}>
                    That link may be wrong or the hackathon was deleted.
                </p>
            </Layout>,
            404,
        );
    }

    const metricRaw = c.req.query('metric');
    const metric: Metric = isMetric(metricRaw) ? metricRaw : 'cost';
    const now = Date.now();
    const state = hackathonState(h, now);

    const [user, members, ids] = await Promise.all([
        currentUser(c),
        listMembers(c.env.DB, h.id),
        memberIds(c.env.DB, h.id),
    ]);

    const entries =
        state === 'upcoming'
            ? []
            : await cachedHackathonLeaderboard(
                  c.env.DB,
                  c.env.RATE_LIMIT,
                  h.slug,
                  {
                      metric,
                      startAt: h.start_at,
                      endAt: h.end_at,
                      memberIds: ids,
                      model: h.model_family ?? undefined,
                      limit: 100,
                  },
              );

    let role: ViewerRole = 'anon';
    if (user) {
        if (user.id === h.host_user_id) role = 'host';
        else if (ids.includes(user.id)) role = 'member';
        else role = 'guest';
    }

    const models =
        role === 'host'
            ? await cachedDistinctModelFamilies(c.env.DB, c.env.RATE_LIMIT)
            : [];

    return c.html(
        <HackathonPage
            base={base}
            hackathon={h}
            state={state}
            metric={metric}
            entries={entries}
            members={members}
            role={role}
            models={models}
        />,
    );
});

export default app;
