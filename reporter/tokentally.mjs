#!/usr/bin/env node
// TokenTally reporter — zero-dependency Node script.
//
// Reads Claude Code / Codex session transcripts, sums token usage per model, and
// POSTs cumulative per-session totals to the TokenTally API. Reporting is
// idempotent (keyed by session id), so running it on SessionStart and SessionEnd
// can never double-count.
//
// Config: ~/.tokentally/config.json  =>  { "apiBase": "https://...", "token": "tt_..." }
// (env TOKENTALLY_API_BASE / TOKENTALLY_TOKEN override the file.)
//
// Usage:
//   node tokentally.mjs claude-sessionend      # hook: parse the just-ended transcript (stdin JSON)
//   node tokentally.mjs claude-sessionstart    # hook: catch up recent Claude sessions
//   node tokentally.mjs codex-sessionstart     # hook: catch up recent Codex sessions
//   node tokentally.mjs claude-report <path>   # parse one Claude transcript
//   node tokentally.mjs codex-report <path>    # parse one Codex rollout

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CATCHUP_DAYS = Number.parseInt(process.env.TOKENTALLY_DAYS ?? '3', 10) || 3;
const MAX_SESSIONS_PER_REQUEST = 200;

// ---------------------------------------------------------------- parsing ----

function emptyTotals() {
    return {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        reasoning_tokens: 0,
    };
}

function toMs(ts) {
    if (typeof ts !== 'string') return null;
    const n = Date.parse(ts);
    return Number.isFinite(n) ? n : null;
}

/**
 * Parse a Claude Code transcript (JSONL). One transcript = one session that may
 * touch several models. Returns { session_id, started_at, models: {model: totals} }.
 */
export function parseClaudeTranscript(text, opts = {}) {
    const models = new Map();
    let sessionId = opts.sessionId ?? null;
    let startedAt = null;

    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let obj;
        try {
            obj = JSON.parse(trimmed);
        } catch {
            continue;
        }
        if (startedAt === null) startedAt = toMs(obj.timestamp);
        if (!sessionId && typeof obj.sessionId === 'string') sessionId = obj.sessionId;

        if (obj.type !== 'assistant') continue;
        const msg = obj.message;
        const usage = msg?.usage;
        if (!usage || typeof usage !== 'object') continue;

        const model = typeof msg.model === 'string' && msg.model ? msg.model : 'unknown';
        const t = models.get(model) ?? emptyTotals();
        t.input_tokens += num(usage.input_tokens);
        t.output_tokens += num(usage.output_tokens);
        t.cache_read_tokens += num(usage.cache_read_input_tokens);
        t.cache_creation_tokens += num(usage.cache_creation_input_tokens);
        models.set(model, t);
    }

    return {
        session_id: sessionId ?? opts.sessionId ?? null,
        started_at: startedAt ?? opts.fallbackStartedAt ?? null,
        models,
    };
}

/**
 * Parse a Codex rollout (JSONL). Attributes each turn's `last_token_usage` to the
 * model active at that point (from session_meta / turn_context).
 */
export function parseCodexRollout(text, opts = {}) {
    const models = new Map();
    let sessionId = opts.sessionId ?? null;
    let startedAt = null;
    let currentModel = 'unknown';

    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let obj;
        try {
            obj = JSON.parse(trimmed);
        } catch {
            continue;
        }
        if (startedAt === null) startedAt = toMs(obj.timestamp);
        const payload = obj.payload ?? {};

        if (obj.type === 'session_meta') {
            if (typeof payload.id === 'string') sessionId = sessionId ?? payload.id;
            const m = modelFromContext(payload);
            if (m) currentModel = m;
            continue;
        }
        if (obj.type === 'turn_context') {
            const m = modelFromContext(payload);
            if (m) currentModel = m;
            continue;
        }
        if (obj.type === 'event_msg' && payload.type === 'token_count') {
            const last = payload.info?.last_token_usage;
            if (!last || typeof last !== 'object') continue;
            const t = models.get(currentModel) ?? emptyTotals();
            t.input_tokens += num(last.input_tokens);
            t.output_tokens += num(last.output_tokens);
            t.cache_read_tokens += num(last.cached_input_tokens);
            t.cache_creation_tokens += num(last.cache_write_input_tokens);
            t.reasoning_tokens += num(last.reasoning_output_tokens);
            models.set(currentModel, t);
        }
    }

    return {
        session_id: sessionId ?? opts.sessionId ?? null,
        started_at: startedAt ?? opts.fallbackStartedAt ?? null,
        models,
    };
}

function modelFromContext(payload) {
    if (typeof payload.model === 'string' && payload.model) return payload.model;
    const nested = payload.turn_context?.model ?? payload.info?.model;
    return typeof nested === 'string' && nested ? nested : null;
}

function num(v) {
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** session id from a filename, stripping known prefixes/suffixes. */
export function sessionIdFromPath(path) {
    let name = basename(path).replace(/\.jsonl$/i, '');
    name = name.replace(/^rollout-/i, '');
    return name;
}

/** Turn a parsed result into API session rows (one per model). */
export function toRows(parsed, path) {
    const sid = parsed.session_id ?? sessionIdFromPath(path ?? '');
    const startedAt = parsed.started_at ?? Date.now();
    const rows = [];
    for (const [model, t] of parsed.models) {
        rows.push({ session_id: sid, model, started_at: startedAt, ...t });
    }
    return rows;
}

// ------------------------------------------------------------- filesystem ----

function walkJsonl(dir, sinceMs, match) {
    const out = [];
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
            out.push(...walkJsonl(full, sinceMs, match));
        } else if (e.isFile() && match(e.name)) {
            try {
                if (statSync(full).mtimeMs >= sinceMs) out.push(full);
            } catch {
                /* ignore */
            }
        }
    }
    return out;
}

function claudeDirs() {
    const home = homedir();
    return [join(home, '.claude', 'projects'), join(home, '.config', 'claude', 'projects')];
}

function codexDirs() {
    const home = homedir();
    return [join(home, '.codex', 'sessions'), join(home, '.codex', 'archived_sessions')];
}

// ------------------------------------------------------------------ io -------

function loadConfig() {
    let file = {};
    try {
        const raw = readFileSync(join(homedir(), '.tokentally', 'config.json'), 'utf8');
        file = JSON.parse(raw);
    } catch {
        /* fall through to env */
    }
    const apiBase = process.env.TOKENTALLY_API_BASE ?? file.apiBase;
    const token = process.env.TOKENTALLY_TOKEN ?? file.token;
    if (!apiBase || !token) {
        throw new Error('TokenTally not configured (missing apiBase/token in ~/.tokentally/config.json)');
    }
    return { apiBase: String(apiBase).replace(/\/+$/, ''), token: String(token) };
}

async function readStdin() {
    if (process.stdin.isTTY) return '';
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
}

async function postSessions(cfg, source, rows) {
    if (rows.length === 0) return { accepted: 0 };
    let accepted = 0;
    for (let i = 0; i < rows.length; i += MAX_SESSIONS_PER_REQUEST) {
        const batch = rows.slice(i, i + MAX_SESSIONS_PER_REQUEST);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        try {
            const res = await fetch(`${cfg.apiBase}/api/ingest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${cfg.token}`,
                },
                body: JSON.stringify({ source, sessions: batch }),
                signal: controller.signal,
            });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                accepted += typeof data.accepted === 'number' ? data.accepted : batch.length;
            } else {
                process.stderr.write(`tokentally: ingest failed (${res.status})\n`);
            }
        } finally {
            clearTimeout(timer);
        }
    }
    return { accepted };
}

function parseFile(path, source) {
    const text = readFileSync(path, 'utf8');
    let fallbackStartedAt = null;
    try {
        fallbackStartedAt = statSync(path).mtimeMs;
    } catch {
        /* ignore */
    }
    const parsed =
        source === 'codex'
            ? parseCodexRollout(text, { fallbackStartedAt })
            : parseClaudeTranscript(text, { fallbackStartedAt });
    return toRows(parsed, path);
}

// --------------------------------------------------------------- commands ----

async function claudeSessionEnd(cfg) {
    const stdin = await readStdin();
    let hook = {};
    try {
        hook = JSON.parse(stdin);
    } catch {
        /* no hook payload */
    }
    const path = hook.transcript_path;
    if (!path) return claudeCatchup(cfg); // fall back to a scan
    const text = readFileSync(path, 'utf8');
    const parsed = parseClaudeTranscript(text, { sessionId: hook.session_id });
    const rows = toRows(parsed, path);
    const { accepted } = await postSessions(cfg, 'claude_code', rows);
    process.stderr.write(`tokentally: reported ${accepted} row(s) for the current session\n`);
}

async function claudeCatchup(cfg) {
    const since = Date.now() - CATCHUP_DAYS * 86_400_000;
    const files = claudeDirs().flatMap((d) => walkJsonl(d, since, (n) => n.endsWith('.jsonl')));
    const rows = files.flatMap((f) => safeParse(f, 'claude_code'));
    const { accepted } = await postSessions(cfg, 'claude_code', rows);
    process.stderr.write(`tokentally: caught up ${accepted} row(s) from ${files.length} file(s)\n`);
}

async function codexCatchup(cfg) {
    const since = Date.now() - CATCHUP_DAYS * 86_400_000;
    const files = codexDirs().flatMap((d) =>
        walkJsonl(d, since, (n) => /^rollout-.*\.jsonl$/i.test(n)),
    );
    const rows = files.flatMap((f) => safeParse(f, 'codex'));
    const { accepted } = await postSessions(cfg, 'codex', rows);
    process.stderr.write(`tokentally: caught up ${accepted} row(s) from ${files.length} file(s)\n`);
}

function safeParse(path, source) {
    try {
        return parseFile(path, source);
    } catch {
        return [];
    }
}

async function reportOne(cfg, path, source) {
    const rows = parseFile(path, source);
    const { accepted } = await postSessions(cfg, source, rows);
    process.stderr.write(`tokentally: reported ${accepted} row(s)\n`);
}

async function main() {
    const cmd = process.argv[2];
    const cfg = loadConfig();
    switch (cmd) {
        case 'claude-sessionend':
            await claudeSessionEnd(cfg);
            break;
        case 'claude-sessionstart':
            await claudeCatchup(cfg);
            break;
        case 'codex-sessionstart':
        case 'codex-sessionend':
            await codexCatchup(cfg);
            break;
        case 'claude-report':
            await reportOne(cfg, process.argv[3], 'claude_code');
            break;
        case 'codex-report':
            await reportOne(cfg, process.argv[3], 'codex');
            break;
        default:
            process.stderr.write(
                'usage: tokentally.mjs <claude-sessionend|claude-sessionstart|codex-sessionstart|claude-report <path>|codex-report <path>>\n',
            );
    }
}

// Only run as a CLI when executed directly — importing (tests) must not trigger it.
const invokedDirectly =
    typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
    main().catch((err) => {
        // Never break the host session — hooks must exit cleanly.
        process.stderr.write(`tokentally: ${err?.message ?? err}\n`);
        process.exit(0);
    });
}
