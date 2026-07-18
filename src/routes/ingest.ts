import { Hono } from 'hono';
import { authenticate } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { parseIngestBody } from '@/lib/validate';
import type { Env } from '@/types';

const app = new Hono<{ Bindings: Env }>();

// POST /api/ingest  (Bearer)
// { source, sessions: [{ session_id, model, started_at, input_tokens, output_tokens,
//   cache_read_tokens, cache_creation_tokens, reasoning_tokens }] }
// Upserts each session row; re-reporting the same session REPLACEs it (idempotent).
app.post('/ingest', async (c) => {
    const user = await authenticate(c.env.DB, c.req.header('Authorization'));
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    const limit = await rateLimit(c.env.RATE_LIMIT, `rl:ingest:${user.id}`, 600, 3600);
    if (!limit.allowed) {
        return c.json({ error: 'rate limit exceeded' }, 429);
    }

    const body = await c.req.json<unknown>().catch(() => null);
    const parsed = parseIngestBody(body);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const { source, sessions } = parsed.value;
    const now = Date.now();

    const stmt = c.env.DB.prepare(
        `INSERT INTO session_usage
           (user_id, source, session_id, model, input_tokens, output_tokens,
            cache_read_tokens, cache_creation_tokens, reasoning_tokens, started_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, source, session_id, model) DO UPDATE SET
           input_tokens = excluded.input_tokens,
           output_tokens = excluded.output_tokens,
           cache_read_tokens = excluded.cache_read_tokens,
           cache_creation_tokens = excluded.cache_creation_tokens,
           reasoning_tokens = excluded.reasoning_tokens,
           started_at = excluded.started_at,
           updated_at = excluded.updated_at`,
    );

    const batch = sessions.map((s) =>
        stmt.bind(
            user.id,
            source,
            s.session_id,
            s.model,
            s.input_tokens,
            s.output_tokens,
            s.cache_read_tokens,
            s.cache_creation_tokens,
            s.reasoning_tokens,
            s.started_at,
            now,
        ),
    );
    await c.env.DB.batch(batch);

    return c.json({ accepted: sessions.length });
});

export { app as ingestRoutes };
