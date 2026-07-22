import { newId } from '@/lib/auth';
import { slugify } from '@/lib/slug';

export interface HackathonRow {
    id: string;
    slug: string;
    slug_lower: string;
    name: string;
    host_user_id: string;
    model_family: string | null;
    start_at: number;
    end_at: number;
    created_at: number;
}

export type HackathonState = 'upcoming' | 'live' | 'ended';

export function hackathonState(h: HackathonRow, now: number): HackathonState {
    if (now < h.start_at) return 'upcoming';
    if (now >= h.end_at) return 'ended';
    return 'live';
}

export interface CreateHackathonInput {
    name: string;
    hostUserId: string;
    modelFamily: string | null;
    startAt: number;
    endAt: number;
}

/** Insert a hackathon (host auto-joined). Returns the row, or null on slug clash. */
export async function createHackathon(
    db: D1Database,
    input: CreateHackathonInput,
    now: number,
): Promise<HackathonRow | null> {
    const base = slugify(input.name) || 'hackathon';
    const slug = `${base}-${newId().slice(0, 6)}`;
    const row: HackathonRow = {
        id: newId(),
        slug,
        slug_lower: slug.toLowerCase(),
        name: input.name,
        host_user_id: input.hostUserId,
        model_family: input.modelFamily,
        start_at: input.startAt,
        end_at: input.endAt,
        created_at: now,
    };
    try {
        await db
            .prepare(
                `INSERT INTO hackathons
                 (id, slug, slug_lower, name, host_user_id, model_family, start_at, end_at, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                row.id,
                row.slug,
                row.slug_lower,
                row.name,
                row.host_user_id,
                row.model_family,
                row.start_at,
                row.end_at,
                row.created_at,
            )
            .run();
    } catch {
        return null;
    }
    await addMember(db, row.id, input.hostUserId, now);
    return row;
}

export async function getHackathonBySlug(
    db: D1Database,
    slug: string,
): Promise<HackathonRow | null> {
    return db
        .prepare('SELECT * FROM hackathons WHERE slug_lower = ?')
        .bind(slug.toLowerCase())
        .first<HackathonRow>();
}

export async function listHackathonsByHost(
    db: D1Database,
    hostUserId: string,
): Promise<HackathonRow[]> {
    const res = await db
        .prepare(
            'SELECT * FROM hackathons WHERE host_user_id = ? ORDER BY created_at DESC',
        )
        .bind(hostUserId)
        .all<HackathonRow>();
    return res.results;
}

export async function addMember(
    db: D1Database,
    hackathonId: string,
    userId: string,
    now: number,
): Promise<void> {
    await db
        .prepare(
            `INSERT INTO hackathon_members (hackathon_id, user_id, joined_at)
             VALUES (?, ?, ?) ON CONFLICT (hackathon_id, user_id) DO NOTHING`,
        )
        .bind(hackathonId, userId, now)
        .run();
}

export async function removeMember(
    db: D1Database,
    hackathonId: string,
    userId: string,
): Promise<void> {
    await db
        .prepare(
            'DELETE FROM hackathon_members WHERE hackathon_id = ? AND user_id = ?',
        )
        .bind(hackathonId, userId)
        .run();
}

export interface MemberRow {
    user_id: string;
    username: string;
    joined_at: number;
}

export async function listMembers(
    db: D1Database,
    hackathonId: string,
): Promise<MemberRow[]> {
    const res = await db
        .prepare(
            `SELECT hm.user_id AS user_id, u.username AS username, hm.joined_at AS joined_at
             FROM hackathon_members hm JOIN users u ON u.id = hm.user_id
             WHERE hm.hackathon_id = ? ORDER BY hm.joined_at ASC`,
        )
        .bind(hackathonId)
        .all<MemberRow>();
    return res.results;
}

export async function memberIds(
    db: D1Database,
    hackathonId: string,
): Promise<string[]> {
    const res = await db
        .prepare('SELECT user_id FROM hackathon_members WHERE hackathon_id = ?')
        .bind(hackathonId)
        .all<{ user_id: string }>();
    return res.results.map((r) => r.user_id);
}

export interface UpdateHackathonInput {
    name: string;
    modelFamily: string | null;
    startAt: number;
    endAt: number;
}

export async function updateHackathon(
    db: D1Database,
    id: string,
    input: UpdateHackathonInput,
): Promise<void> {
    await db
        .prepare(
            `UPDATE hackathons SET name = ?, model_family = ?, start_at = ?, end_at = ? WHERE id = ?`,
        )
        .bind(input.name, input.modelFamily, input.startAt, input.endAt, id)
        .run();
}

export async function deleteHackathon(
    db: D1Database,
    id: string,
): Promise<void> {
    await db.batch([
        db
            .prepare('DELETE FROM hackathon_members WHERE hackathon_id = ?')
            .bind(id),
        db.prepare('DELETE FROM hackathons WHERE id = ?').bind(id),
    ]);
}
