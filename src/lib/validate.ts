import { isSyntheticModel } from '@/lib/model-family';
import { isSource, type SessionUsageInput, type Source } from '@/types';

export const USERNAME_RE = /^[a-zA-Z0-9_-]{2,32}$/u;

const RESERVED = new Set([
    'api',
    'start',
    'about',
    'pricing',
    'u',
    'admin',
    'static',
    'health',
    'leaderboard',
    'login',
    'register',
    'tokentally',
    'tokenmaxer',
    'me',
    'new',
]);

// Guardrails: reject physically implausible reports.
// 2e9 tokens in a single session category
const MAX_TOKENS_PER_CATEGORY = 2_000_000_000;
const MAX_MODEL_LEN = 128;
const MAX_SESSION_ID_LEN = 200;

// Per-request session caps. Live reporting sends small, frequent batches; a
// one-time history backfill sends far more rows at once, so it gets its own cap.
export const MAX_INGEST_SESSIONS = 500;
export const MAX_HISTORY_SESSIONS = 5000;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_PROFILE_URL_LEN = 2048;

export function validateProfileUrl(raw: unknown): Result<string | null> {
    if (raw === null) return { ok: true, value: null };
    if (typeof raw !== 'string') {
        return { ok: false, error: 'url must be a string or null' };
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) return { ok: true, value: null };
    if (trimmed.length > MAX_PROFILE_URL_LEN) {
        return { ok: false, error: 'url too long' };
    }
    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        return { ok: false, error: 'url must be a valid https URL' };
    }
    if (parsed.protocol !== 'https:') {
        return { ok: false, error: 'url must use https' };
    }
    if (parsed.username || parsed.password) {
        return { ok: false, error: 'url must not include credentials' };
    }
    return { ok: true, value: parsed.href };
}

export function validateUsername(raw: unknown): Result<string> {
    if (typeof raw !== 'string')
        return { ok: false, error: 'username must be a string' };
    const username = raw.trim();
    if (!USERNAME_RE.test(username)) {
        return {
            ok: false,
            error: '2–32 chars, letters/numbers/underscore/hyphen only',
        };
    }
    if (RESERVED.has(username.toLowerCase())) {
        return { ok: false, error: 'that username is reserved' };
    }
    return { ok: true, value: username };
}

function coerceCount(v: unknown): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    if (v < 0) return 0;
    return Math.floor(v);
}

export interface IngestPayload {
    source: Source;
    sessions: SessionUsageInput[];
}

function parseSessionEntry(raw: unknown): Result<SessionUsageInput> {
    if (typeof raw !== 'object' || raw === null) {
        return { ok: false, error: 'each session must be an object' };
    }
    const s = raw as Record<string, unknown>;
    if (typeof s.session_id !== 'string' || s.session_id.length === 0) {
        return { ok: false, error: 'session_id is required' };
    }
    if (s.session_id.length > MAX_SESSION_ID_LEN) {
        return { ok: false, error: 'session_id too long' };
    }
    if (typeof s.model !== 'string' || s.model.length === 0) {
        return { ok: false, error: 'model is required' };
    }
    if (s.model.length > MAX_MODEL_LEN) {
        return { ok: false, error: 'model too long' };
    }

    const started_at =
        typeof s.started_at === 'number' &&
        Number.isFinite(s.started_at) &&
        s.started_at > 0
            ? Math.floor(s.started_at)
            : Date.now();

    const row: SessionUsageInput = {
        session_id: s.session_id,
        model: s.model,
        started_at,
        input_tokens: coerceCount(s.input_tokens),
        output_tokens: coerceCount(s.output_tokens),
        cache_read_tokens: coerceCount(s.cache_read_tokens),
        cache_creation_tokens: coerceCount(s.cache_creation_tokens),
        reasoning_tokens: coerceCount(s.reasoning_tokens),
    };

    for (const n of [
        row.input_tokens,
        row.output_tokens,
        row.cache_read_tokens,
        row.cache_creation_tokens,
        row.reasoning_tokens,
    ]) {
        if (n > MAX_TOKENS_PER_CATEGORY) {
            return { ok: false, error: 'implausible token count rejected' };
        }
    }
    return { ok: true, value: row };
}

export function parseIngestBody(
    body: unknown,
    opts: { maxSessions?: number } = {},
): Result<IngestPayload> {
    const maxSessions = opts.maxSessions ?? MAX_INGEST_SESSIONS;
    if (typeof body !== 'object' || body === null) {
        return { ok: false, error: 'body must be a JSON object' };
    }
    const b = body as Record<string, unknown>;

    if (!isSource(b.source)) {
        return {
            ok: false,
            error: "source must be 'claude_code', 'codex', 'opencode', 'pi' or 'cursor'",
        };
    }
    if (!Array.isArray(b.sessions)) {
        return { ok: false, error: 'sessions must be an array' };
    }
    if (b.sessions.length === 0) {
        return { ok: false, error: 'sessions must not be empty' };
    }
    if (b.sessions.length > maxSessions) {
        return {
            ok: false,
            error: `too many sessions (max ${maxSessions})`,
        };
    }

    const sessions: SessionUsageInput[] = [];
    for (const raw of b.sessions) {
        const parsed = parseSessionEntry(raw);
        if (!parsed.ok) return parsed;
        // Skip Claude Code `<synthetic>` rows; all-synthetic batches still succeed.
        if (isSyntheticModel(parsed.value.model)) continue;
        sessions.push(parsed.value);
    }

    return { ok: true, value: { source: b.source, sessions } };
}

/** Same shape as ingest, but with the larger bulk-backfill session cap. */
export function parseHistoryBody(body: unknown): Result<IngestPayload> {
    return parseIngestBody(body, { maxSessions: MAX_HISTORY_SESSIONS });
}
