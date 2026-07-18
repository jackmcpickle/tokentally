import type { SessionUsageInput, Source } from '@/types';

// D1 caps how many statements a single batch may carry, so large payloads (a
// history backfill can send thousands of rows) are written in chunks.
const DB_BATCH_CHUNK = 500;

const UPSERT_SQL = `INSERT INTO session_usage
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
   updated_at = excluded.updated_at`;

/**
 * Idempotently upsert per-session usage rows. Re-reporting the same
 * (user, source, session, model) REPLACEs the row rather than adding, so live
 * reporting and history backfill can overlap without double-counting.
 *
 * Returns the number of rows written.
 */
export async function upsertSessions(
    db: D1Database,
    userId: string,
    source: Source,
    sessions: SessionUsageInput[],
    now: number,
): Promise<number> {
    const stmt = db.prepare(UPSERT_SQL);
    for (let i = 0; i < sessions.length; i += DB_BATCH_CHUNK) {
        const chunk = sessions.slice(i, i + DB_BATCH_CHUNK);
        const batch = chunk.map((s) =>
            stmt.bind(
                userId,
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
        // Chunks are written sequentially on purpose, to avoid flooding D1 with
        // concurrent batches.
        // eslint-disable-next-line no-await-in-loop
        await db.batch(batch);
    }
    return sessions.length;
}
