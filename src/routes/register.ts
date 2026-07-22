import { Hono } from 'hono';
import { authenticate, generateToken, hashToken, newId } from '@/lib/auth';
import { getInviteCookie, inviteSessionAllowed } from '@/lib/invite';
import { rateLimit } from '@/lib/ratelimit';
import {
    validateCountry,
    validateProfileUrl,
    validateUsername,
} from '@/lib/validate';
import type { Env } from '@/types';

const app = new Hono<{ Bindings: Env }>();

function clientIp(header: string | null): string {
    return header?.split(',')[0]?.trim() ?? 'unknown';
}

// Cloudflare Turnstile server-side verification.
async function verifyTurnstile(
    secret: string,
    token: unknown,
    ip: string,
): Promise<boolean> {
    if (typeof token !== 'string' || token.length === 0) return false;
    const body = new FormData();
    body.append('secret', secret);
    body.append('response', token);
    if (ip !== 'unknown') body.append('remoteip', ip);
    const res = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        { method: 'POST', body },
    ).catch(() => null);
    if (!res) return false;
    const data = await res.json<{ success?: boolean }>().catch(() => null);
    return data?.success === true;
}

// POST /api/register  { username } -> { id, username, token }
app.post('/register', async (c) => {
    const ip = clientIp(c.req.header('CF-Connecting-IP') ?? null);
    const limit = await rateLimit(
        c.env.RATE_LIMIT,
        `rl:register:${ip}`,
        10,
        3600,
    );
    if (!limit.allowed) {
        return c.json(
            { error: 'too many registrations, try again later' },
            429,
        );
    }

    const body = await c.req
        .json<{
            username?: unknown;
            turnstileToken?: unknown;
            url?: unknown;
            country?: unknown;
        }>()
        .catch(() => ({
            username: undefined,
            turnstileToken: undefined,
            url: undefined,
            country: undefined,
        }));

    const invited = await inviteSessionAllowed(
        c.env.INVITE_KEY,
        getInviteCookie(c),
    );
    if (!invited) return c.json({ error: 'invite required' }, 403);

    const human = await verifyTurnstile(
        c.env.TURNSTYLE_SECRET_KEY,
        body.turnstileToken,
        ip,
    );
    if (!human) return c.json({ error: 'verification failed' }, 403);

    const check = validateUsername(body.username);
    if (!check.ok) return c.json({ error: check.error }, 400);
    const username = check.value;

    const urlCheck = validateProfileUrl(body.url ?? null);
    if (!urlCheck.ok) return c.json({ error: urlCheck.error }, 400);
    const profileUrl = urlCheck.value;

    const countryCheck = validateCountry(body.country);
    if (!countryCheck.ok) return c.json({ error: countryCheck.error }, 400);
    const country = countryCheck.value;

    const existing = await c.env.DB.prepare(
        'SELECT id FROM users WHERE username_lower = ?',
    )
        .bind(username.toLowerCase())
        .first<{ id: string }>();
    if (existing) return c.json({ error: 'username already taken' }, 409);

    const id = newId();
    const token = generateToken();
    const tokenHash = await hashToken(token);

    try {
        await c.env.DB.prepare(
            'INSERT INTO users (id, username, username_lower, token_hash, created_at, profile_url, country) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
            .bind(
                id,
                username,
                username.toLowerCase(),
                tokenHash,
                Date.now(),
                profileUrl,
                country,
            )
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
