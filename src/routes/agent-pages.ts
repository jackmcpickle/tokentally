import type { Context } from 'hono';
import { Hono } from 'hono';
import { aboutMarkdown } from '@/content/about.md';
import { homeMarkdown } from '@/content/home.md';
import { llmsTxt } from '@/content/llms';
import { llmsFullTxt } from '@/content/llms-full';
import { pricingMarkdown } from '@/content/pricing.md';
import { profileMarkdown, profileNotFoundMarkdown } from '@/content/profile.md';
import { startMarkdown } from '@/content/start.md';
import {
    INVITE_REQUIRED_MD,
    markdownBody,
    plainBody,
} from '@/lib/agent-markdown';
import { baseUrl } from '@/lib/base-url';
import { cachedLeaderboard, cachedProfile } from '@/lib/cached-aggregate';
import { getInviteCookie, inviteSessionAllowed } from '@/lib/invite';
import { pageCache } from '@/lib/page-cache';
import { parseSourceParam, parseWindow } from '@/routes/leaderboard';
import type { Env } from '@/types';

export const agentPageRoutes = new Hono<{ Bindings: Env }>();

/** Shared with `GET /about` in `src/index.tsx` when the request isn't from a browser. */
export async function serveAboutMarkdown(
    _c: Context<{ Bindings: Env }>,
): Promise<Response> {
    return markdownBody(aboutMarkdown());
}

/** Shared with `GET /pricing` in `src/index.tsx` when the request isn't from a browser. */
export async function servePricingMarkdown(
    _c: Context<{ Bindings: Env }>,
): Promise<Response> {
    return markdownBody(pricingMarkdown());
}

/** Shared with `GET /start` in `src/index.tsx` when the request isn't from a browser. */
export async function serveStartMarkdown(
    c: Context<{ Bindings: Env }>,
): Promise<Response> {
    const invited = await inviteSessionAllowed(
        c.env.INVITE_KEY,
        getInviteCookie(c),
    );
    if (!invited) return markdownBody(INVITE_REQUIRED_MD, { status: 403 });
    return markdownBody(startMarkdown(baseUrl(c.env, c.req.url)));
}

/** Shared with `GET /` in `src/index.tsx` when the request isn't from a browser. */
export async function serveHomeMarkdown(
    c: Context<{ Bindings: Env }>,
): Promise<Response> {
    const window = parseWindow(c.req.query('window'));
    const source = parseSourceParam(c.req.query('source'));
    const modelRaw = c.req.query('model');
    const model = modelRaw && modelRaw.length > 0 ? modelRaw : undefined;
    const entries = await cachedLeaderboard(
        c.env.DB,
        c.env.RATE_LIMIT,
        { window, metric: 'total', source, model, limit: 10 },
        Date.now(),
    );
    return markdownBody(
        homeMarkdown({
            base: baseUrl(c.env, c.req.url),
            entries,
            window,
            source,
            model,
        }),
    );
}

/**
 * Shared with `GET /u/:username` in `src/index.tsx` when the request isn't from
 * a browser. Reads the `username` param and, if present, strips a trailing
 * `.md` suffix so the same handler serves both `/u/:username` and the
 * `/u/:username.md` route registered below.
 */
export async function serveProfileMarkdown(
    c: Context<{ Bindings: Env }>,
): Promise<Response> {
    const raw = c.req.param('username') ?? '';
    const username = raw.endsWith('.md') ? raw.slice(0, -3) : raw;
    const profile = await cachedProfile(c.env.DB, c.env.RATE_LIMIT, username);
    if (!profile) {
        return markdownBody(profileNotFoundMarkdown(username), {
            status: 404,
        });
    }
    return markdownBody(
        profileMarkdown({
            base: baseUrl(c.env, c.req.url),
            profile,
        }),
    );
}

agentPageRoutes.get('/llms.txt', (c) =>
    plainBody(llmsTxt(baseUrl(c.env, c.req.url))),
);

agentPageRoutes.get('/llms-full.txt', (c) =>
    plainBody(llmsFullTxt(baseUrl(c.env, c.req.url))),
);

agentPageRoutes.get('/about.md', (c) => serveAboutMarkdown(c));

agentPageRoutes.get('/pricing.md', (c) => servePricingMarkdown(c));

agentPageRoutes.get('/start.md', (c) => serveStartMarkdown(c));

agentPageRoutes.get('/index.md', pageCache, (c) => serveHomeMarkdown(c));

agentPageRoutes.get('/u/:username{.+\\.md}', pageCache, (c) =>
    serveProfileMarkdown(c),
);
