import type { UserRow } from '@/types';

const TOKEN_PREFIX = 'tt_';

function toBase64Url(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(bytes: Uint8Array): string {
    let out = '';
    for (const b of bytes) out += b.toString(16).padStart(2, '0');
    return out;
}

/** Opaque, URL-safe user id (not secret). */
export function newId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return toHex(bytes);
}

/** Secret bearer token shown to the user exactly once. */
export function generateToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return TOKEN_PREFIX + toBase64Url(bytes);
}

/** SHA-256 hex of a token — this is what we persist. */
export async function hashToken(token: string): Promise<string> {
    const data = new TextEncoder().encode(token);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return toHex(new Uint8Array(digest));
}

/** Pull the raw token out of an `Authorization: Bearer <token>` header. */
export function extractBearer(header: string | null | undefined): string | null {
    if (!header) return null;
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match?.[1]?.trim() ?? null;
}

/** Resolve the authenticated user from an Authorization header, or null. */
export async function authenticate(
    db: D1Database,
    header: string | null | undefined,
): Promise<UserRow | null> {
    const token = extractBearer(header);
    if (!token) return null;
    const tokenHash = await hashToken(token);
    const user = await db
        .prepare(
            'SELECT id, username, username_lower, token_hash, created_at FROM users WHERE token_hash = ?',
        )
        .bind(tokenHash)
        .first<UserRow>();
    return user ?? null;
}
