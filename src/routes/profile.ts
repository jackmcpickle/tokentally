import { Hono } from 'hono';
import { authenticate } from '@/lib/auth';
import { invalidateProfileCache } from '@/lib/cached-aggregate';
import { rateLimit } from '@/lib/ratelimit';
import { validateProfileUrl } from '@/lib/validate';
import type { Env } from '@/types';

const app = new Hono<{ Bindings: Env }>();

// POST /api/profile  (Bearer)  { url: string | null } -> { username, url }
app.post('/profile', async (c) => {
    const user = await authenticate(c.env.DB, c.req.header('Authorization'));
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    const limit = await rateLimit(
        c.env.RATE_LIMIT,
        `rl:profile:${user.id}`,
        20,
        3600,
    );
    if (!limit.allowed) {
        return c.json({ error: 'rate limit exceeded' }, 429);
    }

    const body = await c.req.json<unknown>().catch(() => null);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return c.json({ error: 'body must be an object' }, 400);
    }
    const rawUrl = (body as { url?: unknown }).url;
    if (!('url' in body)) {
        return c.json({ error: 'url is required' }, 400);
    }

    const parsed = validateProfileUrl(rawUrl);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    await c.env.DB.prepare('UPDATE users SET profile_url = ? WHERE id = ?')
        .bind(parsed.value, user.id)
        .run();
    await invalidateProfileCache(c.env.RATE_LIMIT, user.username);

    return c.json({ username: user.username, url: parsed.value });
});

export { app as profileRoutes };
