import type { Context } from 'hono';
import { getSessionCookie, resolveSession } from '@/lib/session';
import type { Env, UserRow } from '@/types';

/** Resolve the logged-in user from the session cookie, or null. */
export function currentUser(
    c: Context<{ Bindings: Env }>,
): Promise<UserRow | null> {
    return resolveSession(c.env.DB, getSessionCookie(c), Date.now());
}
