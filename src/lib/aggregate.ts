import { estimateCost } from '@/lib/pricing';
import type { Metric, Source, TimeWindow } from '@/types';

const DAY_MS = 86_400_000;

export function windowStart(window: TimeWindow, now: number): number {
    switch (window) {
        case 'today':
            return now - (now % DAY_MS); // start of current UTC day
        case '7d':
            return now - 7 * DAY_MS;
        case '30d':
            return now - 30 * DAY_MS;
        case 'all':
            return 0;
    }
}

export interface Totals {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    reasoning_tokens: number;
    cost: number;
}

export interface LeaderboardEntry extends Totals {
    rank: number;
    username: string;
    sessions: number;
    grand_total: number; // sum of all token categories
}

export interface ModelBreakdown extends Totals {
    source: Source;
    model: string;
}

export interface Profile extends Totals {
    username: string;
    created_at: number;
    rank: number;
    sessions: number;
    grand_total: number;
    breakdown: ModelBreakdown[];
}

interface GroupedRow {
    username: string;
    user_id: string;
    source: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    reasoning_tokens: number;
    sessions: number;
}

function emptyTotals(): Totals {
    return {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        reasoning_tokens: 0,
        cost: 0,
    };
}

function addRow(t: Totals, r: GroupedRow): void {
    t.input_tokens += r.input_tokens;
    t.output_tokens += r.output_tokens;
    t.cache_read_tokens += r.cache_read_tokens;
    t.cache_creation_tokens += r.cache_creation_tokens;
    t.reasoning_tokens += r.reasoning_tokens;
    t.cost += estimateCost(r.model, r);
}

export function grandTotal(t: Totals): number {
    return (
        t.input_tokens +
        t.output_tokens +
        t.cache_read_tokens +
        t.cache_creation_tokens +
        t.reasoning_tokens
    );
}

export function metricValue(t: Totals, metric: Metric): number {
    switch (metric) {
        case 'total':
            return grandTotal(t);
        case 'io':
            return t.input_tokens + t.output_tokens;
        case 'output':
            return t.output_tokens;
        case 'cost':
            return t.cost;
    }
}

const GROUP_SELECT = `
  SELECT u.username AS username, su.user_id AS user_id, su.source AS source, su.model AS model,
         SUM(su.input_tokens) AS input_tokens,
         SUM(su.output_tokens) AS output_tokens,
         SUM(su.cache_read_tokens) AS cache_read_tokens,
         SUM(su.cache_creation_tokens) AS cache_creation_tokens,
         SUM(su.reasoning_tokens) AS reasoning_tokens,
         COUNT(DISTINCT su.session_id) AS sessions
  FROM session_usage su
  JOIN users u ON u.id = su.user_id
`;

export interface LeaderboardQuery {
    window: TimeWindow;
    metric: Metric;
    source?: Source;
    model?: string;
    limit?: number;
}

export async function getLeaderboard(
    db: D1Database,
    q: LeaderboardQuery,
    now: number,
): Promise<LeaderboardEntry[]> {
    const conditions = ['su.started_at >= ?'];
    const binds: (string | number)[] = [windowStart(q.window, now)];
    if (q.source) {
        conditions.push('su.source = ?');
        binds.push(q.source);
    }
    if (q.model) {
        conditions.push('su.model = ?');
        binds.push(q.model);
    }
    const sql = `${GROUP_SELECT} WHERE ${conditions.join(' AND ')} GROUP BY su.user_id, su.source, su.model`;
    const res = await db
        .prepare(sql)
        .bind(...binds)
        .all<GroupedRow>();

    const byUser = new Map<string, { username: string; totals: Totals; sessions: number }>();
    for (const r of res.results) {
        let entry = byUser.get(r.user_id);
        if (!entry) {
            entry = { username: r.username, totals: emptyTotals(), sessions: 0 };
            byUser.set(r.user_id, entry);
        }
        addRow(entry.totals, r);
        // Approximate: a session spanning multiple models is counted per model.
        entry.sessions += r.sessions;
    }

    const entries: LeaderboardEntry[] = [];
    for (const [, v] of byUser) {
        entries.push({
            rank: 0,
            username: v.username,
            sessions: v.sessions,
            grand_total: grandTotal(v.totals),
            ...v.totals,
        });
    }
    entries.sort((a, b) => metricValue(b, q.metric) - metricValue(a, q.metric));
    const limited = entries.slice(0, q.limit ?? 100);
    limited.forEach((e, i) => {
        e.rank = i + 1;
    });
    return limited;
}

export async function getDistinctModels(db: D1Database): Promise<string[]> {
    const res = await db
        .prepare('SELECT DISTINCT model FROM session_usage ORDER BY model')
        .all<{ model: string }>();
    return res.results.map((r) => r.model);
}

export async function getProfile(db: D1Database, username: string): Promise<Profile | null> {
    const user = await db
        .prepare('SELECT id, username, created_at FROM users WHERE username_lower = ?')
        .bind(username.toLowerCase())
        .first<{ id: string; username: string; created_at: number }>();
    if (!user) return null;

    const res = await db
        .prepare(`${GROUP_SELECT} WHERE su.user_id = ? GROUP BY su.source, su.model`)
        .bind(user.id)
        .all<GroupedRow>();

    const totals = emptyTotals();
    const breakdown: ModelBreakdown[] = [];
    let sessions = 0;
    for (const r of res.results) {
        addRow(totals, r);
        sessions += r.sessions;
        const bt = emptyTotals();
        addRow(bt, r);
        breakdown.push({ source: r.source as Source, model: r.model, ...bt });
    }
    breakdown.sort((a, b) => grandTotal(b) - grandTotal(a));

    const myTotal = grandTotal(totals);
    const rankRes = await db
        .prepare(
            `SELECT COUNT(*) AS ahead FROM (
               SELECT user_id, SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens + reasoning_tokens) AS t
               FROM session_usage GROUP BY user_id HAVING t > ?
             )`,
        )
        .bind(myTotal)
        .first<{ ahead: number }>();

    return {
        username: user.username,
        created_at: user.created_at,
        rank: (rankRes?.ahead ?? 0) + 1,
        sessions,
        grand_total: myTotal,
        breakdown,
        ...totals,
    };
}
