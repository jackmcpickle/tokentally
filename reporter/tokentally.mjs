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
//   node tokentally.mjs claude-sessionend        # hook: parse the just-ended transcript (stdin JSON)
//   node tokentally.mjs claude-sessionstart      # hook: catch up recent Claude sessions
//   node tokentally.mjs codex-sessionstart       # hook: catch up recent Codex sessions
//   node tokentally.mjs opencode-sessionstart    # hook: catch up recent opencode sessions
//   node tokentally.mjs pi-sessionstart          # hook: catch up recent pi sessions
//   node tokentally.mjs claude-report <path>     # parse one Claude transcript
//   node tokentally.mjs codex-report <path>      # parse one Codex rollout
//   node tokentally.mjs opencode-report <sessID> # parse one opencode session
//   node tokentally.mjs pi-report <path>         # parse one pi session file
//   node tokentally.mjs backfill [claude|codex|opencode|pi] # one-time: upload ALL past history

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CATCHUP_DAYS =
    Number.parseInt(process.env.TOKENTALLY_DAYS ?? '3', 10) || 3;
const MAX_SESSIONS_PER_REQUEST = 200;
// Bulk history backfill posts to a separate endpoint in larger chunks.
const HISTORY_CHUNK = 500;

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
        if (!sessionId && typeof obj.sessionId === 'string')
            sessionId = obj.sessionId;

        if (obj.type !== 'assistant') continue;
        const msg = obj.message;
        const usage = msg?.usage;
        if (!usage || typeof usage !== 'object') continue;

        const model =
            typeof msg.model === 'string' && msg.model ? msg.model : 'unknown';
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

function accumulateCodexTokenCount(models, currentModel, payload) {
    const last = payload.info?.last_token_usage;
    if (!last || typeof last !== 'object') return;
    const t = models.get(currentModel) ?? emptyTotals();
    t.input_tokens += num(last.input_tokens);
    t.output_tokens += num(last.output_tokens);
    t.cache_read_tokens += num(last.cached_input_tokens);
    t.cache_creation_tokens += num(last.cache_write_input_tokens);
    t.reasoning_tokens += num(last.reasoning_output_tokens);
    models.set(currentModel, t);
}

function applyCodexSessionMeta(payload, state) {
    if (typeof payload.id === 'string')
        state.sessionId = state.sessionId ?? payload.id;
    const m = modelFromContext(payload);
    if (m) state.currentModel = m;
}

function applyCodexTurnContext(payload, state) {
    const m = modelFromContext(payload);
    if (m) state.currentModel = m;
}

function processCodexLine(obj, state, models) {
    if (state.startedAt === null) state.startedAt = toMs(obj.timestamp);
    const payload = obj.payload ?? {};

    if (obj.type === 'session_meta') {
        applyCodexSessionMeta(payload, state);
        return;
    }
    if (obj.type === 'turn_context') {
        applyCodexTurnContext(payload, state);
        return;
    }
    if (obj.type === 'event_msg' && payload.type === 'token_count') {
        accumulateCodexTokenCount(models, state.currentModel, payload);
    }
}

/**
 * Parse a Codex rollout (JSONL). Attributes each turn's `last_token_usage` to the
 * model active at that point (from session_meta / turn_context).
 */
export function parseCodexRollout(text, opts = {}) {
    const models = new Map();
    const state = {
        sessionId: opts.sessionId ?? null,
        startedAt: null,
        currentModel: 'unknown',
    };

    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let obj;
        try {
            obj = JSON.parse(trimmed);
        } catch {
            continue;
        }
        processCodexLine(obj, state, models);
    }

    return {
        session_id: state.sessionId ?? opts.sessionId ?? null,
        started_at: state.startedAt ?? opts.fallbackStartedAt ?? null,
        models,
    };
}

function modelFromContext(payload) {
    if (typeof payload.model === 'string' && payload.model)
        return payload.model;
    const nested = payload.turn_context?.model ?? payload.info?.model;
    return typeof nested === 'string' && nested ? nested : null;
}

function opencodeTimestamp(msg) {
    const created = msg.time?.created ?? msg.time?.start ?? msg.timestamp;
    return typeof created === 'number' ? created : toMs(created);
}

// Written defensively — opencode has revised its message shape, so both nested
// (`tokens.cache.read`) and flat (`cache_read`) keys are tolerated.
function accumulateOpencodeTokens(models, msg) {
    const tokens = msg.tokens;
    if (!tokens || typeof tokens !== 'object') return;
    const model =
        typeof msg.modelID === 'string' && msg.modelID
            ? msg.modelID
            : 'unknown';
    const cache =
        tokens.cache && typeof tokens.cache === 'object' ? tokens.cache : {};
    const t = models.get(model) ?? emptyTotals();
    t.input_tokens += num(tokens.input);
    t.output_tokens += num(tokens.output);
    t.reasoning_tokens += num(tokens.reasoning);
    t.cache_read_tokens += num(cache.read ?? tokens.cache_read);
    t.cache_creation_tokens += num(cache.write ?? tokens.cache_write);
    models.set(model, t);
}

/**
 * Parse a set of opencode assistant messages (each `msg_*.json` under
 * `storage/message/<sessionID>/` is one message object). Sums the `tokens.*`
 * block per model.
 */
export function parseOpencodeMessages(messages, opts = {}) {
    const models = new Map();
    let sessionId = opts.sessionId ?? null;
    let startedAt = null;

    for (const msg of messages) {
        if (!msg || typeof msg !== 'object') continue;
        if (!sessionId && typeof msg.sessionID === 'string')
            sessionId = msg.sessionID;
        const ts = opencodeTimestamp(msg);
        if (ts !== null && (startedAt === null || ts < startedAt))
            startedAt = ts;
        if (msg.role === 'assistant') accumulateOpencodeTokens(models, msg);
    }

    return {
        session_id: sessionId ?? opts.sessionId ?? null,
        started_at: startedAt ?? opts.fallbackStartedAt ?? null,
        models,
    };
}

function piUsage(obj) {
    if (obj.usage && typeof obj.usage === 'object') return obj.usage;
    const nested = obj.message?.usage;
    return nested && typeof nested === 'object' ? nested : null;
}

function piModel(obj) {
    const m =
        obj.model ?? obj.modelID ?? obj.message?.model ?? obj.usage?.model;
    return typeof m === 'string' && m ? m : null;
}

function piSessionId(obj) {
    if (typeof obj.sessionId === 'string') return obj.sessionId;
    if (typeof obj.session_id === 'string') return obj.session_id;
    return null;
}

function accumulatePiUsage(t, usage) {
    t.input_tokens += num(usage.input ?? usage.input_tokens);
    t.output_tokens += num(usage.output ?? usage.output_tokens);
    t.cache_read_tokens += num(
        usage.cacheRead ?? usage.cache_read ?? usage.cache_read_input_tokens,
    );
    t.cache_creation_tokens += num(
        usage.cacheWrite ??
            usage.cache_write ??
            usage.cache_creation_input_tokens,
    );
    t.reasoning_tokens += num(
        usage.reasoning ??
            usage.reasoning_tokens ??
            usage.reasoning_output_tokens,
    );
}

function processPiLine(obj, state, models, seen) {
    if (state.startedAt === null)
        state.startedAt = toMs(obj.timestamp ?? obj.time);
    if (!state.sessionId) state.sessionId = piSessionId(obj);

    const model = piModel(obj);
    if (model) state.currentModel = model;

    const usage = piUsage(obj);
    if (!usage) return;

    // Skip records already counted on another branch of the tree.
    if (typeof obj.id === 'string') {
        if (seen.has(obj.id)) return;
        seen.add(obj.id);
    }

    const t = models.get(state.currentModel) ?? emptyTotals();
    accumulatePiUsage(t, usage);
    models.set(state.currentModel, t);
}

/**
 * Parse a pi session file (JSONL). pi stores a *tree* of records keyed by
 * `id`/`parentId` in one file, so the same record can appear more than once —
 * we dedupe by `id` before summing each record's `usage` per active model.
 */
export function parsePiRollout(text, opts = {}) {
    const models = new Map();
    const seen = new Set();
    const state = {
        sessionId: opts.sessionId ?? null,
        startedAt: null,
        currentModel: 'unknown',
    };

    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let obj;
        try {
            obj = JSON.parse(trimmed);
        } catch {
            continue;
        }
        processPiLine(obj, state, models, seen);
    }

    return {
        session_id: state.sessionId ?? opts.sessionId ?? null,
        started_at: state.startedAt ?? opts.fallbackStartedAt ?? null,
        models,
    };
}

function num(v) {
    return typeof v === 'number' && Number.isFinite(v) && v > 0
        ? Math.floor(v)
        : 0;
}

/** session id from a filename, stripping known prefixes/suffixes. */
export function sessionIdFromPath(path) {
    let name = basename(path).replace(/\.jsonl$/iu, '');
    name = name.replace(/^rollout-/iu, '');
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
    return [
        join(home, '.claude', 'projects'),
        join(home, '.config', 'claude', 'projects'),
    ];
}

function codexDirs() {
    const home = homedir();
    return [
        join(home, '.codex', 'sessions'),
        join(home, '.codex', 'archived_sessions'),
    ];
}

// opencode stores one JSON file per message under storage/message/<sessionID>/.
function opencodeMessageRoots() {
    const roots = [];
    if (process.env.OPENCODE_DATA_DIR)
        roots.push(join(process.env.OPENCODE_DATA_DIR, 'storage', 'message'));
    if (process.env.XDG_DATA_HOME)
        roots.push(
            join(process.env.XDG_DATA_HOME, 'opencode', 'storage', 'message'),
        );
    roots.push(
        join(homedir(), '.local', 'share', 'opencode', 'storage', 'message'),
    );
    return roots;
}

// pi stores one JSONL file per session, nested under a per-directory slug.
function piDirs() {
    const explicit =
        process.env.PI_CODING_AGENT_SESSION_DIR ?? process.env.PI_AGENT_DIR;
    const dirs = explicit ? [explicit] : [];
    dirs.push(join(homedir(), '.pi', 'agent', 'sessions'));
    return dirs;
}

function parseOpencodeFiles(texts, opts) {
    const messages = [];
    for (const text of texts) {
        try {
            messages.push(JSON.parse(text));
        } catch {
            /* skip unreadable message file */
        }
    }
    return parseOpencodeMessages(messages, opts);
}

// Read every message JSON in one opencode session dir, tracking the newest mtime.
function readOpencodeSessionTexts(dir) {
    let files;
    try {
        files = readdirSync(dir, { withFileTypes: true });
    } catch {
        return null;
    }
    let newest = 0;
    const texts = [];
    for (const f of files) {
        if (!f.isFile() || !/\.json$/iu.test(f.name)) continue;
        const full = join(dir, f.name);
        try {
            const st = statSync(full);
            if (st.mtimeMs > newest) newest = st.mtimeMs;
            texts.push(readFileSync(full, 'utf8'));
        } catch {
            /* ignore */
        }
    }
    return { texts, newest };
}

/**
 * Walk opencode's message store, grouping the per-message JSON files back into
 * sessions (one session = one directory). A session is included when any of its
 * message files was modified at/after `sinceMs`.
 */
function collectOpencodeRows(sinceMs) {
    const rows = [];
    for (const root of opencodeMessageRoots()) {
        let sessions;
        try {
            sessions = readdirSync(root, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const s of sessions) {
            if (!s.isDirectory()) continue;
            const res = readOpencodeSessionTexts(join(root, s.name));
            if (!res || res.texts.length === 0 || res.newest < sinceMs)
                continue;
            const parsed = parseOpencodeFiles(res.texts, {
                sessionId: s.name,
                fallbackStartedAt: res.newest,
            });
            rows.push(...toRows(parsed, s.name));
        }
    }
    return rows;
}

function opencodeSessionCandidates(sessionArg) {
    // Accept either an absolute session directory or a bare sessionID.
    try {
        if (statSync(sessionArg).isDirectory()) return [sessionArg];
    } catch {
        /* not a path — treat as sessionID below */
    }
    return opencodeMessageRoots().map((root) => join(root, sessionArg));
}

function reportOneOpencodeSession(sessionArg) {
    for (const dir of opencodeSessionCandidates(sessionArg)) {
        const res = readOpencodeSessionTexts(dir);
        if (!res || res.texts.length === 0) continue;
        const parsed = parseOpencodeFiles(res.texts, {
            sessionId: basename(dir),
        });
        return toRows(parsed, basename(dir));
    }
    return [];
}

// ------------------------------------------------------------------ io -------

function loadConfig() {
    let file = {};
    try {
        const raw = readFileSync(
            join(homedir(), '.tokentally', 'config.json'),
            'utf8',
        );
        file = JSON.parse(raw);
    } catch {
        /* fall through to env */
    }
    const apiBase = process.env.TOKENTALLY_API_BASE ?? file.apiBase;
    const token = process.env.TOKENTALLY_TOKEN ?? file.token;
    if (!apiBase || !token) {
        throw new Error(
            'TokenTally not configured (missing apiBase/token in ~/.tokentally/config.json)',
        );
    }
    return {
        apiBase: String(apiBase).replace(/\/+$/u, ''),
        token: String(token),
    };
}

async function readStdin() {
    if (process.stdin.isTTY) return '';
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
}

async function postBatch(cfg, source, batch, path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
        const res = await fetch(`${cfg.apiBase}${path}`, {
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
            return typeof data.accepted === 'number'
                ? data.accepted
                : batch.length;
        }
        process.stderr.write(`tokentally: ingest failed (${res.status})\n`);
        return 0;
    } finally {
        clearTimeout(timer);
    }
}

async function postSessions(cfg, source, rows, opts = {}) {
    if (rows.length === 0) return { accepted: 0 };
    const path = opts.path ?? '/api/ingest';
    const chunkSize = opts.chunkSize ?? MAX_SESSIONS_PER_REQUEST;
    const batches = [];
    for (let i = 0; i < rows.length; i += chunkSize) {
        batches.push(rows.slice(i, i + chunkSize));
    }
    const acceptedCounts = await Promise.all(
        batches.map((batch) => postBatch(cfg, source, batch, path)),
    );
    return { accepted: acceptedCounts.reduce((sum, n) => sum + n, 0) };
}

function parseFile(path, source) {
    const text = readFileSync(path, 'utf8');
    let fallbackStartedAt = null;
    try {
        fallbackStartedAt = statSync(path).mtimeMs;
    } catch {
        /* ignore */
    }
    let parsed;
    if (source === 'codex')
        parsed = parseCodexRollout(text, { fallbackStartedAt });
    else if (source === 'pi')
        parsed = parsePiRollout(text, { fallbackStartedAt });
    else parsed = parseClaudeTranscript(text, { fallbackStartedAt });
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
    // fall back to a scan when no transcript path is provided
    if (!path) return claudeCatchup(cfg);
    const text = readFileSync(path, 'utf8');
    const parsed = parseClaudeTranscript(text, { sessionId: hook.session_id });
    const rows = toRows(parsed, path);
    const { accepted } = await postSessions(cfg, 'claude_code', rows);
    process.stderr.write(
        `tokentally: reported ${accepted} row(s) for the current session\n`,
    );
}

async function claudeCatchup(cfg) {
    const since = Date.now() - CATCHUP_DAYS * 86_400_000;
    const files = claudeDirs().flatMap((d) =>
        walkJsonl(d, since, (n) => n.endsWith('.jsonl')),
    );
    const rows = files.flatMap((f) => safeParse(f, 'claude_code'));
    const { accepted } = await postSessions(cfg, 'claude_code', rows);
    process.stderr.write(
        `tokentally: caught up ${accepted} row(s) from ${files.length} file(s)\n`,
    );
}

async function codexCatchup(cfg) {
    const since = Date.now() - CATCHUP_DAYS * 86_400_000;
    const files = codexDirs().flatMap((d) =>
        walkJsonl(d, since, (n) => /^rollout-.*\.jsonl$/iu.test(n)),
    );
    const rows = files.flatMap((f) => safeParse(f, 'codex'));
    const { accepted } = await postSessions(cfg, 'codex', rows);
    process.stderr.write(
        `tokentally: caught up ${accepted} row(s) from ${files.length} file(s)\n`,
    );
}

async function opencodeCatchup(cfg) {
    const since = Date.now() - CATCHUP_DAYS * 86_400_000;
    const rows = collectOpencodeRows(since);
    const { accepted } = await postSessions(cfg, 'opencode', rows);
    process.stderr.write(`tokentally: caught up ${accepted} opencode row(s)\n`);
}

async function piCatchup(cfg) {
    const since = Date.now() - CATCHUP_DAYS * 86_400_000;
    const files = piDirs().flatMap((d) =>
        walkJsonl(d, since, (n) => n.endsWith('.jsonl')),
    );
    const rows = files.flatMap((f) => safeParse(f, 'pi'));
    const { accepted } = await postSessions(cfg, 'pi', rows);
    process.stderr.write(
        `tokentally: caught up ${accepted} pi row(s) from ${files.length} file(s)\n`,
    );
}

async function reportOneOpencode(cfg, sessionArg) {
    const rows = reportOneOpencodeSession(sessionArg);
    const { accepted } = await postSessions(cfg, 'opencode', rows);
    process.stderr.write(`tokentally: reported ${accepted} opencode row(s)\n`);
}

function safeParse(path, source) {
    try {
        return parseFile(path, source);
    } catch {
        return [];
    }
}

/**
 * One-time bulk backfill: scan ALL local Claude/Codex transcripts (ignoring the
 * catch-up window) and POST them to /api/history. Idempotent, so it's safe to
 * run alongside the normal hooks and safe to re-run. Pass 'claude' or 'codex' to
 * limit the scan to one tool.
 */
async function backfillFiles(cfg, source, rows, label, fileCount) {
    const { accepted } = await postSessions(cfg, source, rows, {
        path: '/api/history',
        chunkSize: HISTORY_CHUNK,
    });
    process.stderr.write(
        `tokentally: backfilled ${accepted} ${label} row(s) from ${fileCount} file(s)\n`,
    );
    return accepted;
}

async function backfill(cfg, only) {
    let total = 0;
    if (!only || only === 'claude') {
        const files = claudeDirs().flatMap((d) =>
            walkJsonl(d, 0, (n) => n.endsWith('.jsonl')),
        );
        const rows = files.flatMap((f) => safeParse(f, 'claude_code'));
        total += await backfillFiles(
            cfg,
            'claude_code',
            rows,
            'Claude Code',
            files.length,
        );
    }
    if (!only || only === 'codex') {
        const files = codexDirs().flatMap((d) =>
            walkJsonl(d, 0, (n) => /^rollout-.*\.jsonl$/iu.test(n)),
        );
        const rows = files.flatMap((f) => safeParse(f, 'codex'));
        total += await backfillFiles(cfg, 'codex', rows, 'Codex', files.length);
    }
    if (!only || only === 'opencode') {
        const rows = collectOpencodeRows(0);
        const { accepted } = await postSessions(cfg, 'opencode', rows, {
            path: '/api/history',
            chunkSize: HISTORY_CHUNK,
        });
        total += accepted;
        process.stderr.write(
            `tokentally: backfilled ${accepted} opencode row(s)\n`,
        );
    }
    if (!only || only === 'pi') {
        const files = piDirs().flatMap((d) =>
            walkJsonl(d, 0, (n) => n.endsWith('.jsonl')),
        );
        const rows = files.flatMap((f) => safeParse(f, 'pi'));
        total += await backfillFiles(cfg, 'pi', rows, 'pi', files.length);
    }
    process.stderr.write(
        `tokentally: backfill complete — ${total} row(s) total\n`,
    );
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
        case 'opencode-sessionstart':
        case 'opencode-sessionend':
            await opencodeCatchup(cfg);
            break;
        case 'pi-sessionstart':
        case 'pi-sessionend':
            await piCatchup(cfg);
            break;
        case 'claude-report':
            await reportOne(cfg, process.argv[3], 'claude_code');
            break;
        case 'codex-report':
            await reportOne(cfg, process.argv[3], 'codex');
            break;
        case 'opencode-report':
            await reportOneOpencode(cfg, process.argv[3]);
            break;
        case 'pi-report':
            await reportOne(cfg, process.argv[3], 'pi');
            break;
        case 'backfill': {
            // Optional scope: `backfill claude|codex|opencode|pi`.
            const only = ['claude', 'codex', 'opencode', 'pi'].includes(
                process.argv[3],
            )
                ? process.argv[3]
                : undefined;
            await backfill(cfg, only);
            break;
        }
        default:
            process.stderr.write(
                'usage: tokentally.mjs <claude-sessionend|claude-sessionstart|codex-sessionstart|opencode-sessionstart|pi-sessionstart|claude-report <path>|codex-report <path>|opencode-report <sessionID>|pi-report <path>|backfill [claude|codex|opencode|pi]>\n',
            );
    }
}

// Only run as a CLI when executed directly — importing (tests) must not trigger it.
const invokedDirectly =
    typeof process.argv[1] === 'string' &&
    import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
    main().catch((err) => {
        // Never break the host session — hooks must exit cleanly.
        process.stderr.write(`tokentally: ${err?.message ?? err}\n`);
        process.exit(0);
    });
}
