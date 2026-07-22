import { describe, expect, it } from 'vitest';
import { memoryKv } from '@/__tests__/helpers/kv';
import { hashToken } from '@/lib/auth';
import {
    consumePendingSession,
    createPendingSession,
    resolveSession,
} from '@/lib/session';

interface SessionRow {
    id_hash: string;
    user_id: string;
    created_at: number;
    expires_at: number;
}

// Minimal D1 mock for web_sessions insert + resolve-by-hash join.
function db(sessions: SessionRow[], user: { id: string; username: string }) {
    return {
        prepare(sql: string) {
            let binds: unknown[] = [];
            return {
                bind(...args: unknown[]) {
                    binds = args;
                    return this;
                },
                async run() {
                    if (sql.includes('INSERT INTO web_sessions')) {
                        sessions.push({
                            id_hash: binds[0] as string,
                            user_id: binds[1] as string,
                            created_at: binds[2] as number,
                            expires_at: binds[3] as number,
                        });
                    }
                },
                async first<T>() {
                    const [idHash, now] = binds as [string, number];
                    const hit = sessions.find(
                        (s) => s.id_hash === idHash && s.expires_at > now,
                    );
                    if (!hit || hit.user_id !== user.id) return null as T;
                    return {
                        id: user.id,
                        username: user.username,
                        username_lower: user.username.toLowerCase(),
                        token_hash: 'x',
                        created_at: 0,
                    } as T;
                },
            };
        },
    } as unknown as D1Database;
}

describe('web sessions', () => {
    it('mints, exchanges once, and resolves the user', async () => {
        const kv = memoryKv();
        const sessions: SessionRow[] = [];
        const user = { id: 'u1', username: 'Ada' };
        const d1 = db(sessions, user);
        const now = Date.now();

        const pending = await createPendingSession(kv, user.id);
        const sessionId = await consumePendingSession(d1, kv, pending, now);
        expect(sessionId).toBeTruthy();

        // Single use: the pending token can't be exchanged twice.
        expect(await consumePendingSession(d1, kv, pending, now)).toBeNull();

        const resolved = await resolveSession(d1, sessionId ?? undefined, now);
        expect(resolved?.username).toBe('Ada');
    });

    it('rejects an unknown pending token', async () => {
        const kv = memoryKv();
        const d1 = db([], { id: 'u1', username: 'Ada' });
        expect(
            await consumePendingSession(d1, kv, 'nope', Date.now()),
        ).toBeNull();
    });

    it('does not resolve an expired session', async () => {
        const kv = memoryKv();
        const sessions: SessionRow[] = [];
        const user = { id: 'u1', username: 'Ada' };
        const d1 = db(sessions, user);
        const pending = await createPendingSession(kv, user.id);
        const sessionId = await consumePendingSession(
            d1,
            kv,
            pending,
            Date.now(),
        );
        // Far-future "now" is past the 30-day expiry.
        const later = Date.now() + 40 * 24 * 60 * 60 * 1000;
        expect(
            await resolveSession(d1, sessionId ?? undefined, later),
        ).toBeNull();
    });

    it('stores only the hash of the pending token in KV', async () => {
        const kv = memoryKv();
        const pending = await createPendingSession(kv, 'u1');
        expect(await kv.get(`sess:pending:${pending}`)).toBeNull();
        expect(await kv.get(`sess:pending:${await hashToken(pending)}`)).toBe(
            'u1',
        );
    });
});
