import { Hono } from 'hono';
import { authenticate, generateToken, hashToken, newId } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { validateUsername } from '@/lib/validate';
import type { Env } from '@/types';

const app = new Hono<{ Bindings: Env }>();

function clientIp(header: string | null): string {
    return header?.split(',')[0]?.trim() ?? 'unknown';
}

// POST /api/register  { username } -> { id, username, token }
app.post('/register', async (c) => {
    const ip = clientIp(c.req.header('CF-Connecting-IP') ?? null);
    const limit = await rateLimit(c.env.RATE_LIMIT, `rl:register:${ip}`, 10, 3600);
    if (!limit.allowed) {
        return c.json({ error: 'too many registrations, try again later' }, 429);
    }

    const body = await c.req.json<{ username?: unknown }>().catch(() => ({ username: undefined }));
    const check = validateUsername(body.username);
    if (!check.ok) return c.json({ error: check.error }, 400);
    const username = check.value;

    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE username_lower = ?')
        .bind(username.toLowerCase())
        .first<{ id: string }>();
    if (existing) return c.json({ error: 'username already taken' }, 409);

    const id = newId();
    const token = generateToken();
    const tokenHash = await hashToken(token);

    try {
        await c.env.DB.prepare(
            'INSERT INTO users (id, username, username_lower, token_hash, created_at) VALUES (?, ?, ?, ?, ?)',
        )
            .bind(id, username, username.toLowerCase(), tokenHash, Date.now())
            .run();
    } catch {
        // Unique-index race: someone claimed the name between the check and insert.
        return c.json({ error: 'username already taken' }, 409);
    }

    return c.json({ id, username, token }, 201);
});

// POST /api/token/rotate  (Bearer) -> { token }
app.post('/token/rotate', async (c) => {
    const user = await authenticate(c.env.DB, c.req.header('Authorization'));
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    const token = generateToken();
    const tokenHash = await hashToken(token);
    await c.env.DB.prepare('UPDATE users SET token_hash = ? WHERE id = ?')
        .bind(tokenHash, user.id)
        .run();

    return c.json({ token });
});

export { app as registerRoutes };
