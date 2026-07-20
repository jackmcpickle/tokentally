import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { asObject } from '../lib/parse-utils';
import { accumulateModelUsage, usageFromFields } from '../lib/totals';
import type {
    JsonObject,
    ReporterConfig,
    ReporterRow,
    ReporterTotals,
} from '../lib/types';
import { CURSOR_USAGE_FIELDS } from '../lib/usage-fields';

// Cursor serializes some token counts as strings; coerce the known fields to
// numbers before the shared field mapping.
function cursorUsage(raw: JsonObject): ReporterTotals {
    const coerced: JsonObject = {};
    for (const field of Object.values(CURSOR_USAGE_FIELDS)) {
        const v = raw[field];
        coerced[field] = typeof v === 'string' && v.trim() ? Number(v) : v;
    }
    return usageFromFields(coerced, CURSOR_USAGE_FIELDS);
}

function hasTokens(t: ReporterTotals): boolean {
    return (
        t.input_tokens > 0 ||
        t.output_tokens > 0 ||
        t.cache_read_tokens > 0 ||
        t.cache_creation_tokens > 0
    );
}

/**
 * Bucket Cursor dashboard usage events by UTC day + model into session rows.
 * One synthetic session per day ("cursor-YYYY-MM-DD"); re-summing a whole day
 * on every run keeps ingestion idempotent (server upserts by session+model).
 */
export function parseCursorEvents(events: unknown[]): ReporterRow[] {
    // 'YYYY-MM-DD' -> Map(model -> totals)
    const days = new Map<string, Map<string, ReporterTotals>>();
    for (const raw of Array.isArray(events) ? events : []) {
        if (!raw || typeof raw !== 'object') continue;
        const e = raw as JsonObject;
        const ms = Number(e.timestamp);
        if (!Number.isFinite(ms) || ms <= 0) continue;
        if (!e.tokenUsage || typeof e.tokenUsage !== 'object') continue;
        // Zero-usage events (aborted/errored requests) carry no tokens.
        const usage = cursorUsage(asObject(e.tokenUsage));
        if (!hasTokens(usage)) continue;
        const day = new Date(ms).toISOString().slice(0, 10);
        const model =
            typeof e.model === 'string' && e.model ? e.model : 'unknown';
        const byModel = days.get(day) ?? new Map<string, ReporterTotals>();
        accumulateModelUsage(byModel, model, usage);
        days.set(day, byModel);
    }
    const rows: ReporterRow[] = [];
    for (const [day, byModel] of days) {
        const startedAt = Date.parse(`${day}T00:00:00Z`);
        for (const [model, t] of byModel) {
            rows.push({
                session_id: `cursor-${day}`,
                model,
                started_at: startedAt,
                ...t,
            });
        }
    }
    return rows;
}

// Cursor stores its auth JWT in the app's global state SQLite DB.
function cursorDbPaths(): string[] {
    const home = homedir();
    return [
        join(
            home,
            'Library',
            'Application Support',
            'Cursor',
            'User',
            'globalStorage',
            'state.vscdb',
        ),
        join(home, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
        join(
            process.env.APPDATA ?? join(home, 'AppData', 'Roaming'),
            'Cursor',
            'User',
            'globalStorage',
            'state.vscdb',
        ),
    ];
}

// Older Cursor builds store the value JSON-quoted; current builds store the raw JWT.
function normalizeCursorToken(value: unknown): string | null {
    let token = typeof value === 'string' ? value : null;
    if (token?.startsWith('"')) {
        try {
            const parsed: unknown = JSON.parse(token);
            token = typeof parsed === 'string' ? parsed : token;
        } catch {
            /* keep raw */
        }
    }
    return typeof token === 'string' && token ? token : null;
}

function jwtSub(jwt: string): string | null {
    try {
        const segment = jwt.split('.')[1];
        if (!segment) return null;
        const payload: unknown = JSON.parse(
            Buffer.from(segment, 'base64url').toString('utf8'),
        );
        // sub looks like "auth0|user_xxx"; the cookie wants the trailing id part.
        const sub = String(asObject(payload).sub ?? '');
        return sub.includes('|') ? (sub.split('|').pop() ?? null) : sub || null;
    } catch {
        return null;
    }
}

// Read cursorAuth/accessToken from one state.vscdb and build the session cookie.
// Cookie format is {userId}::{jwt}; userId comes from the JWT sub claim.
function cursorTokenFromDb(path: string): string | null {
    const db = new DatabaseSync(path, { readOnly: true });
    try {
        const row = db
            .prepare(
                "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'",
            )
            .get() as { value?: unknown } | undefined;
        const token = normalizeCursorToken(row?.value);
        if (!token) return null;
        const sub = jwtSub(token);
        return sub ? `${sub}::${token}` : null;
    } finally {
        db.close();
    }
}

// Try each known state.vscdb location; fall back to cfg.cursorCookie.
export function cursorSessionToken(cfg: ReporterConfig): string | null {
    for (const path of cursorDbPaths()) {
        try {
            const token = cursorTokenFromDb(path);
            if (token) return token;
        } catch {
            /* try next path / fallback */
        }
    }
    return typeof cfg.cursorCookie === 'string' && cfg.cursorCookie
        ? cfg.cursorCookie
        : null;
}

// The response reports how many events match the query; pagination trusts it
// over per-page counts because the API can return short non-final pages.
function cursorTotalCount(payload: JsonObject): number | null {
    const v = payload.totalUsageEventsCount;
    const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

// Unofficial dashboard endpoint — the only individual route to Cursor usage.
export async function cursorFetchEvents(
    sessionToken: string,
    sinceMs: number,
): Promise<unknown[] | null> {
    const events: unknown[] = [];
    let expectedTotal: number | null = null;
    for (let page = 1; page <= 200; page += 1) {
        // eslint-disable-next-line no-await-in-loop -- pagination is inherently sequential
        const res = await fetch(
            'https://cursor.com/api/dashboard/get-filtered-usage-events',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Origin: 'https://cursor.com',
                    Cookie: `WorkosCursorSessionToken=${encodeURIComponent(sessionToken)}`,
                },
                body: JSON.stringify({
                    teamId: 0,
                    startDate: String(sinceMs),
                    endDate: String(Date.now()),
                    page,
                    pageSize: 1000,
                }),
            },
        );
        if (!res.ok) {
            process.stderr.write(
                `tokenmaxer: cursor usage fetch failed (${res.status})\n`,
            );
            return null;
        }
        // eslint-disable-next-line no-await-in-loop -- pagination is inherently sequential
        const data: unknown = await res.json().catch(() => null);
        if (data === null) return null;
        const payload = asObject(data);
        expectedTotal = cursorTotalCount(payload) ?? expectedTotal;
        const batch = payload.usageEvents ?? payload.usageEventsDisplay ?? [];
        if (!Array.isArray(batch) || batch.length === 0) break;
        events.push(...batch);
        if (expectedTotal !== null && events.length >= expectedTotal) break;
        if (expectedTotal === null && batch.length < 1000) break;
    }
    return events;
}
