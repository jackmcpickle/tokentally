import { Hono } from 'hono';
import { authenticate } from '@/lib/auth';
import { baseUrl } from '@/lib/base-url';
import { rateLimit } from '@/lib/ratelimit';
import { createPendingSession, destroySession } from '@/lib/session';
import type { Env } from '@/types';

const app = new Hono<{ Bindings: Env }>();

// POST /api/session  (Bearer) -> { url } — magic URL that logs the browser in.
app.post('/session', async (c) => {
    const user = await authenticate(c.env.DB, c.req.header('Authorization'));
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    const ip =
        c.req.header('CF-Connecting-IP')?.split(',')[0]?.trim() ?? 'unknown';
    const limit = await rateLimit(
        c.env.RATE_LIMIT,
        `rl:session:${ip}`,
        20,
        3600,
    );
    if (!limit.allowed) {
        return c.json(
            { error: 'too many login attempts, try again later' },
            429,
        );
    }

    const pendingId = await createPendingSession(c.env.RATE_LIMIT, user.id);
    const base = baseUrl(c.env, c.req.url).replace(/\/$/u, '');
    return c.json({ url: `${base}/auth?s=${pendingId}` });
});

// POST /api/logout — clear the session cookie + row.
app.post('/logout', async (c) => {
    await destroySession(c, c.env.DB);
    return c.json({ ok: true });
});

export { app as sessionRoutes };
