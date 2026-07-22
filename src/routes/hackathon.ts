import { Hono } from 'hono';
import { getDistinctModelFamilies } from '@/lib/aggregate';
import { invalidateHackathonCache } from '@/lib/cached-aggregate';
import {
    addMember,
    createHackathon,
    deleteHackathon,
    getHackathonBySlug,
    removeMember,
    updateHackathon,
} from '@/lib/hackathon';
import {
    validateHackathonName,
    validateHackathonRange,
    validateModelFamily,
} from '@/lib/validate';
import { currentUser } from '@/lib/web-auth';
import type { Env } from '@/types';

const app = new Hono<{ Bindings: Env }>();

// POST /api/hackathons { name, startAt, endAt, modelFamily? } -> { slug }
app.post('/hackathons', async (c) => {
    const user = await currentUser(c);
    if (!user) return c.json({ error: 'login required' }, 401);

    const body = await c.req
        .json<Record<string, unknown>>()
        .catch(() => ({}) as Record<string, unknown>);

    const name = validateHackathonName(body.name);
    if (!name.ok) return c.json({ error: name.error }, 400);
    const range = validateHackathonRange(body.startAt, body.endAt);
    if (!range.ok) return c.json({ error: range.error }, 400);
    const families = await getDistinctModelFamilies(c.env.DB);
    const family = validateModelFamily(body.modelFamily, families);
    if (!family.ok) return c.json({ error: family.error }, 400);

    const row = await createHackathon(
        c.env.DB,
        {
            name: name.value,
            hostUserId: user.id,
            modelFamily: family.value,
            startAt: range.value.startAt,
            endAt: range.value.endAt,
        },
        Date.now(),
    );
    if (!row) return c.json({ error: 'could not create hackathon' }, 500);
    return c.json({ slug: row.slug }, 201);
});

// POST /api/hackathons/:slug/join — self-join (login required).
app.post('/hackathons/:slug/join', async (c) => {
    const user = await currentUser(c);
    if (!user) return c.json({ error: 'login required' }, 401);
    const h = await getHackathonBySlug(c.env.DB, c.req.param('slug'));
    if (!h) return c.json({ error: 'not found' }, 404);
    await addMember(c.env.DB, h.id, user.id, Date.now());
    await invalidateHackathonCache(c.env.RATE_LIMIT, h.slug);
    return c.json({ ok: true });
});

// DELETE /api/hackathons/:slug/members/:username — host removes a member.
app.delete('/hackathons/:slug/members/:username', async (c) => {
    const user = await currentUser(c);
    if (!user) return c.json({ error: 'login required' }, 401);
    const h = await getHackathonBySlug(c.env.DB, c.req.param('slug'));
    if (!h) return c.json({ error: 'not found' }, 404);
    if (h.host_user_id !== user.id) return c.json({ error: 'forbidden' }, 403);

    const target = await c.env.DB.prepare(
        'SELECT id FROM users WHERE username_lower = ?',
    )
        .bind(c.req.param('username').toLowerCase())
        .first<{ id: string }>();
    if (!target) return c.json({ error: 'user not found' }, 404);
    if (target.id === h.host_user_id) {
        return c.json({ error: 'host cannot be removed' }, 400);
    }
    await removeMember(c.env.DB, h.id, target.id);
    await invalidateHackathonCache(c.env.RATE_LIMIT, h.slug);
    return c.json({ ok: true });
});

// PATCH /api/hackathons/:slug — host edits details.
app.patch('/hackathons/:slug', async (c) => {
    const user = await currentUser(c);
    if (!user) return c.json({ error: 'login required' }, 401);
    const h = await getHackathonBySlug(c.env.DB, c.req.param('slug'));
    if (!h) return c.json({ error: 'not found' }, 404);
    if (h.host_user_id !== user.id) return c.json({ error: 'forbidden' }, 403);

    const body = await c.req
        .json<Record<string, unknown>>()
        .catch(() => ({}) as Record<string, unknown>);
    const name = validateHackathonName(body.name);
    if (!name.ok) return c.json({ error: name.error }, 400);
    const range = validateHackathonRange(body.startAt, body.endAt);
    if (!range.ok) return c.json({ error: range.error }, 400);
    const families = await getDistinctModelFamilies(c.env.DB);
    const family = validateModelFamily(body.modelFamily, families);
    if (!family.ok) return c.json({ error: family.error }, 400);

    await updateHackathon(c.env.DB, h.id, {
        name: name.value,
        modelFamily: family.value,
        startAt: range.value.startAt,
        endAt: range.value.endAt,
    });
    await invalidateHackathonCache(c.env.RATE_LIMIT, h.slug);
    return c.json({ ok: true });
});

// DELETE /api/hackathons/:slug — host deletes.
app.delete('/hackathons/:slug', async (c) => {
    const user = await currentUser(c);
    if (!user) return c.json({ error: 'login required' }, 401);
    const h = await getHackathonBySlug(c.env.DB, c.req.param('slug'));
    if (!h) return c.json({ error: 'not found' }, 404);
    if (h.host_user_id !== user.id) return c.json({ error: 'forbidden' }, 403);
    await deleteHackathon(c.env.DB, h.id);
    await invalidateHackathonCache(c.env.RATE_LIMIT, h.slug);
    return c.json({ ok: true });
});

export { app as hackathonRoutes };
