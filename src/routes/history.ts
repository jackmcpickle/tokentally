import { Hono } from 'hono';
import { authenticate } from '@/lib/auth';
import { invalidateProfileCache } from '@/lib/cached-aggregate';
import { rateLimit } from '@/lib/ratelimit';
import { upsertSessions } from '@/lib/store';
import { parseHistoryBody } from '@/lib/validate';
import type { Env } from '@/types';

const app = new Hono<{ Bindings: Env }>();

// POST /api/history  (Bearer)
// Bulk backfill of past sessions. Same body shape as /api/ingest —
// { source, sessions: [...] } — but with a larger per-request cap and its own
// rate-limit bucket, so a one-time history upload doesn't exhaust the live
// reporting budget. Upserts are idempotent, so a backfill that overlaps rows
// already reported by the hooks never double-counts. Structurally invalid rows
// are reported per-index in `rejected` while the valid rows are still upserted;
// `accepted` counts the rows actually written.
app.post('/history', async (c) => {
    const user = await authenticate(c.env.DB, c.req.header('Authorization'));
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    // Backfills are bursty but rare: allow a handful of large requests per hour.
    const limit = await rateLimit(
        c.env.RATE_LIMIT,
        `rl:history:${user.id}`,
        30,
        3600,
    );
    if (!limit.allowed) {
        return c.json({ error: 'rate limit exceeded' }, 429);
    }

    const body = await c.req.json<unknown>().catch(() => null);
    const parsed = parseHistoryBody(body);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const { source, sessions, rejected } = parsed.value;
    // A batch whose rows were all rejected changes nothing: skip the upsert
    // and keep the user's cached profile aggregates warm.
    if (sessions.length > 0) {
        await upsertSessions(c.env.DB, user.id, source, sessions, Date.now());
        await invalidateProfileCache(c.env.RATE_LIMIT, user.username);
    }

    return c.json({ accepted: sessions.length, rejected });
});

export { app as historyRoutes };
