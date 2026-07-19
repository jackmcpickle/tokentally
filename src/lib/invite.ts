import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

/** Session cookie set by `/invite` after a valid key is presented. */
export const INVITE_COOKIE = 'tt_invite';

/**
 * Shared invite key gate. Comparison is constant-time via SHA-256 digests so
 * the key can't be recovered byte-by-byte from response timing. An unset key
 * disables the gate (local dev).
 */
export async function inviteAllowed(
    configuredKey: string | undefined,
    provided: unknown,
): Promise<boolean> {
    if (!configuredKey) return true;
    if (typeof provided !== 'string' || provided.length === 0) return false;
    const enc = new TextEncoder();
    const [a, b] = await Promise.all([
        crypto.subtle.digest('SHA-256', enc.encode(configuredKey)),
        crypto.subtle.digest('SHA-256', enc.encode(provided)),
    ]);
    const av = new Uint8Array(a);
    const bv = new Uint8Array(b);
    let diff = 0;
    for (let i = 0; i < av.length; i += 1) diff |= (av[i] ?? 0) ^ (bv[i] ?? 0);
    return diff === 0;
}

/** Opaque cookie value derived from the configured key (never the raw secret). */
export async function inviteCookieToken(
    configuredKey: string,
): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`tt_invite:${configuredKey}`),
    );
    return [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** True when the invite gate is off, or the session cookie matches. */
export async function inviteSessionAllowed(
    configuredKey: string | undefined,
    cookie: unknown,
): Promise<boolean> {
    if (!configuredKey) return true;
    if (typeof cookie !== 'string' || cookie.length === 0) return false;
    return inviteAllowed(await inviteCookieToken(configuredKey), cookie);
}

/** Raw invite cookie value — still validate with `inviteSessionAllowed`. */
export function getInviteCookie(c: Context): string | undefined {
    return getCookie(c, INVITE_COOKIE);
}

/**
 * Browser-session invite cookie (no Max-Age). HttpOnly so page JS can't read
 * it. Stores a derived token, not the raw invite key.
 */
export async function setInviteCookie(
    c: Context,
    configuredKey: string,
): Promise<void> {
    setCookie(c, INVITE_COOKIE, await inviteCookieToken(configuredKey), {
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        secure: new URL(c.req.url).protocol === 'https:',
    });
}
