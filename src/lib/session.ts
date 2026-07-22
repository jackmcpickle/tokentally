import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { hashToken, newId } from '@/lib/auth';
import type { UserRow } from '@/types';

/** Durable browser-session cookie set after the magic-URL exchange. */
export const SESSION_COOKIE = 'tt_session';

/** 30 days, in seconds — durable session + cookie lifetime. */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Short-lived pending magic-URL token (single use). 10 minutes. */
export const PENDING_TTL_SECONDS = 600;

function pendingKey(idHash: string): string {
    return `sess:pending:${idHash}`;
}

/**
 * Mint a single-use pending token (bearer-authenticated caller). The raw id is
 * returned for the magic URL; only its hash is stored in KV.
 */
export async function createPendingSession(
    kv: KVNamespace,
    userId: string,
): Promise<string> {
    const pendingId = newId() + newId();
    const idHash = await hashToken(pendingId);
    await kv.put(pendingKey(idHash), userId, {
        expirationTtl: PENDING_TTL_SECONDS,
    });
    return pendingId;
}

/**
 * Consume a pending token (single use) and open a durable session. Returns the
 * raw session id to store in the cookie, or null when the token is unknown.
 */
export async function consumePendingSession(
    db: D1Database,
    kv: KVNamespace,
    pendingId: string,
    now: number,
): Promise<string | null> {
    const idHash = await hashToken(pendingId);
    const userId = await kv.get(pendingKey(idHash));
    if (!userId) return null;
    await kv.delete(pendingKey(idHash));

    const sessionId = newId() + newId();
    const sessionHash = await hashToken(sessionId);
    await db
        .prepare(
            'INSERT INTO web_sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
        )
        .bind(sessionHash, userId, now, now + SESSION_TTL_SECONDS * 1000)
        .run();
    return sessionId;
}

/** Resolve the logged-in user from the session cookie, or null. */
export async function resolveSession(
    db: D1Database,
    cookieValue: string | undefined,
    now: number,
): Promise<UserRow | null> {
    if (!cookieValue) return null;
    const sessionHash = await hashToken(cookieValue);
    const user = await db
        .prepare(
            `SELECT u.id, u.username, u.username_lower, u.token_hash, u.created_at
             FROM web_sessions ws JOIN users u ON u.id = ws.user_id
             WHERE ws.id_hash = ? AND ws.expires_at > ?`,
        )
        .bind(sessionHash, now)
        .first<UserRow>();
    return user ?? null;
}

/** Read the raw session cookie (still resolve via resolveSession). */
export function getSessionCookie(c: Context): string | undefined {
    return getCookie(c, SESSION_COOKIE);
}

export function setSessionCookie(c: Context, sessionId: string): void {
    setCookie(c, SESSION_COOKIE, sessionId, {
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        secure: new URL(c.req.url).protocol === 'https:',
        maxAge: SESSION_TTL_SECONDS,
    });
}

/** Clear the cookie and drop the durable row. */
export async function destroySession(
    c: Context,
    db: D1Database,
): Promise<void> {
    const cookieValue = getSessionCookie(c);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    if (cookieValue) {
        const sessionHash = await hashToken(cookieValue);
        await db
            .prepare('DELETE FROM web_sessions WHERE id_hash = ?')
            .bind(sessionHash)
            .run();
    }
}
