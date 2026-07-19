export interface Env {
    DB: D1Database;
    RATE_LIMIT: KVNamespace;
    ENVIRONMENT: string;
    PUBLIC_BASE_URL: string;
    TURNSTYLE_SECRET_KEY: string;
}

export type Source = 'claude_code' | 'codex' | 'opencode' | 'pi';

export const SOURCES: readonly Source[] = [
    'claude_code',
    'codex',
    'opencode',
    'pi',
] as const;

export function isSource(v: unknown): v is Source {
    return (
        v === 'claude_code' || v === 'codex' || v === 'opencode' || v === 'pi'
    );
}

/** A single row of cumulative usage for one (user, source, session, model). */
export interface SessionUsageInput {
    session_id: string;
    model: string;
    started_at: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    reasoning_tokens: number;
}

export interface UserRow {
    id: string;
    username: string;
    username_lower: string;
    token_hash: string;
    created_at: number;
}

export type TimeWindow = 'today' | '7d' | '30d' | 'all';

export const TIME_WINDOWS: readonly TimeWindow[] = [
    'today',
    '7d',
    '30d',
    'all',
] as const;

export function isTimeWindow(v: unknown): v is TimeWindow {
    return v === 'today' || v === '7d' || v === '30d' || v === 'all';
}

export type Metric = 'total' | 'io' | 'output' | 'cost';

export const METRICS: readonly Metric[] = [
    'total',
    'io',
    'output',
    'cost',
] as const;

export function isMetric(v: unknown): v is Metric {
    return v === 'total' || v === 'io' || v === 'output' || v === 'cost';
}
