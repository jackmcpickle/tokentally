# Cursor Support + Tabbed Start Page + Invite Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cursor as a tracked source (reporter pull via Cursor's local auth + dashboard API), restructure `/start` setup into tabs with a copyable agent prompt, and gate username claims behind a shared invite URL key.

**Architecture:** Reporter gains a `cursor-sync` command that reads Cursor's access token from its local SQLite `state.vscdb` (cookie fallback in config), pulls usage events from Cursor's dashboard endpoint, and buckets them by UTC day + model into standard session rows. Server adds `cursor` to the Source union. Start page renders setup tabs publicly with placeholder tokens; the claim form and `/api/register` require `?invite=<INVITE_KEY>`.

**Tech Stack:** Cloudflare Workers (Hono, hono/jsx), D1, Vitest, zero-dep Node >=24 reporter (`node:sqlite`).

## Global Constraints

- Reporter stays **zero-dependency**; Node `>=24` (`node:sqlite` is built in).
- Spec: `docs/superpowers/specs/2026-07-18-cursor-support-and-tabbed-start-page-design.md`.
  Note: main now also supports `opencode` and `pi` sources — tabs include them
  (spec predates that merge; treat the tab list as Agent / Claude Code / Codex /
  opencode / pi / Cursor).
- Reporter commands must **never fail a hook**: on any error print to stderr and exit 0.
- Cursor's dashboard endpoint is **unofficial** — code against it defensively (skip malformed events, tolerate missing fields).
- `INVITE_KEY` unset ⇒ ungated (dev convenience). Never render the key into public HTML.
- Run tests with `pnpm vitest run <file>`. Lint/format: `pnpm oxlint` / `pnpm oxfmt` if scripts exist (check `package.json`).
- Commit messages: extremely concise, prefix `feat:`/`docs:`/`test:` style used in repo history.

---

### Task 1: Server `cursor` source

**Files:**
- Modify: `src/types.ts:9-22` (Source union/list/guard)
- Modify: `src/lib/validate.ts:121-126` (error message)
- Modify: `src/pages/profile.tsx:18-23` (`SOURCE_LABELS`)
- Modify: `src/pages/home.tsx:~184` (filter `<option>` list, after `pi`)
- Test: `src/__tests__/validate.test.ts`

**Interfaces:**
- Produces: `Source` union includes `'cursor'`; `isSource('cursor') === true`; ingest/history accept `source: 'cursor'`.

- [ ] **Step 1: Write failing tests** — append to the `parseIngestBody` describe in `src/__tests__/validate.test.ts`:

```ts
it('accepts cursor source', () => {
    expect(parseIngestBody({ source: 'cursor', sessions: [] }).ok).toBe(false); // empty sessions still rejected
    expect(isSource('cursor')).toBe(true);
});
```

(import `isSource` from `../types` at top alongside existing imports.)

- [ ] **Step 2: Run** `pnpm vitest run src/__tests__/validate.test.ts` — expect FAIL (`isSource('cursor')` false).
- [ ] **Step 3: Implement** — in `src/types.ts`:

```ts
export type Source = 'claude_code' | 'codex' | 'opencode' | 'pi' | 'cursor';

export const SOURCES: readonly Source[] = [
    'claude_code',
    'codex',
    'opencode',
    'pi',
    'cursor',
] as const;

export function isSource(v: unknown): v is Source {
    return (
        v === 'claude_code' ||
        v === 'codex' ||
        v === 'opencode' ||
        v === 'pi' ||
        v === 'cursor'
    );
}
```

In `src/lib/validate.ts` update the message to `"source must be 'claude_code', 'codex', 'opencode', 'pi' or 'cursor'"`. In `src/pages/profile.tsx` add `cursor: 'Cursor',` to `SOURCE_LABELS`. In `src/pages/home.tsx` add after the `pi` option:

```tsx
<option
    value="cursor"
    selected={p.source === 'cursor'}
>
    Cursor
</option>
```

- [ ] **Step 4: Run** `pnpm vitest run src/__tests__/validate.test.ts` — expect PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: add cursor source"`

---

### Task 2: Reporter `parseCursorEvents`

**Files:**
- Modify: `reporter/tokentally.mjs` (add exported pure function near other parsers)
- Test: `src/__tests__/reporter.test.ts`

**Interfaces:**
- Produces: `parseCursorEvents(events: unknown[]): rows[]` — rows shaped `{ session_id: 'cursor-YYYY-MM-DD', model, started_at: <UTC day start ms>, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, reasoning_tokens: 0 }`.
- Event shape consumed (Cursor dashboard): `{ timestamp: '<epoch-ms string>', model: 'claude-4.5-sonnet', tokenUsage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } }`.

- [ ] **Step 1: Write failing tests** — append to `src/__tests__/reporter.test.ts` (extend the existing import from `../../reporter/tokentally.mjs` with `parseCursorEvents`):

```ts
describe('parseCursorEvents', () => {
    const ev = (ts, model, usage) => ({
        timestamp: String(ts),
        model,
        tokenUsage: usage,
    });
    const DAY = Date.UTC(2026, 6, 18); // 2026-07-18T00:00:00Z

    it('buckets events by UTC day and model', () => {
        const rows = parseCursorEvents([
            ev(DAY + 1000, 'claude-4.5-sonnet', {
                inputTokens: 10,
                outputTokens: 20,
                cacheReadTokens: 30,
                cacheWriteTokens: 5,
            }),
            ev(DAY + 5000, 'claude-4.5-sonnet', {
                inputTokens: 1,
                outputTokens: 2,
                cacheReadTokens: 3,
                cacheWriteTokens: 4,
            }),
            ev(DAY + 6000, 'gpt-5', { inputTokens: 7, outputTokens: 8 }),
            ev(DAY + 86_400_000, 'gpt-5', { inputTokens: 100, outputTokens: 1 }),
        ]);
        expect(rows).toHaveLength(3);
        const sonnet = rows.find((r) => r.model === 'claude-4.5-sonnet');
        expect(sonnet).toMatchObject({
            session_id: 'cursor-2026-07-18',
            started_at: DAY,
            input_tokens: 11,
            output_tokens: 22,
            cache_read_tokens: 33,
            cache_creation_tokens: 9,
            reasoning_tokens: 0,
        });
        const day2 = rows.find((r) => r.session_id === 'cursor-2026-07-19');
        expect(day2).toMatchObject({ model: 'gpt-5', input_tokens: 100 });
    });

    it('skips malformed events and empty input', () => {
        expect(parseCursorEvents([])).toEqual([]);
        expect(
            parseCursorEvents([
                null,
                {},
                { timestamp: 'nope', model: 'm', tokenUsage: { inputTokens: 1 } },
                { timestamp: '123', tokenUsage: { inputTokens: 1 } }, // no model -> 'unknown'
            ]),
        ).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/__tests__/reporter.test.ts` — expect FAIL (no export).
- [ ] **Step 3: Implement** in `reporter/tokentally.mjs` (after the opencode parsers, reusing existing `num()` / `emptyTotals()`):

```js
/**
 * Bucket Cursor dashboard usage events by UTC day + model into session rows.
 * One synthetic session per day ("cursor-YYYY-MM-DD"); re-summing a whole day
 * on every run keeps ingestion idempotent (server upserts by session+model).
 */
export function parseCursorEvents(events) {
    const days = new Map(); // 'YYYY-MM-DD' -> Map(model -> totals)
    for (const e of Array.isArray(events) ? events : []) {
        if (!e || typeof e !== 'object') continue;
        const ms = Number(e.timestamp);
        if (!Number.isFinite(ms) || ms <= 0) continue;
        const u = e.tokenUsage;
        if (!u || typeof u !== 'object') continue;
        const day = new Date(ms).toISOString().slice(0, 10);
        const model =
            typeof e.model === 'string' && e.model ? e.model : 'unknown';
        const byModel = days.get(day) ?? new Map();
        const t = byModel.get(model) ?? emptyTotals();
        t.input_tokens += num(u.inputTokens);
        t.output_tokens += num(u.outputTokens);
        t.cache_read_tokens += num(u.cacheReadTokens);
        t.cache_creation_tokens += num(u.cacheWriteTokens);
        byModel.set(model, t);
        days.set(day, byModel);
    }
    const rows = [];
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
```

- [ ] **Step 4: Run** `pnpm vitest run src/__tests__/reporter.test.ts` — expect PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: reporter parses cursor usage events"`

---

### Task 3: Reporter `cursor-sync` command + backfill

**Files:**
- Modify: `reporter/tokentally.mjs` — auth/fetch/sync helpers, `main()` switch (~line 736), `backfill()` (add cursor branch), usage string, header comment.

**Interfaces:**
- Consumes: `parseCursorEvents` (Task 2), existing `postSessions(cfg, source, rows, opts)`, `loadConfig()`, `CATCHUP_DAYS`.
- Produces: CLI commands `cursor-sync`, `backfill cursor`; optional `cursorCookie` config key.
- **Caution:** the dashboard endpoint is unofficial. Shapes below come from research (CodexBar et al.); verify against a live response during the manual step and adjust field names defensively — parsing already tolerates unknown shapes.

- [ ] **Step 1: Implement auth helpers** (no unit tests — filesystem/network; pure parsing was covered in Task 2):

```js
import { DatabaseSync } from 'node:sqlite';

// Cursor stores its auth JWT in the app's global state SQLite DB.
function cursorDbPaths() {
    const home = homedir();
    return [
        join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
        join(home, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
        join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
    ];
}

// Read cursorAuth/accessToken from state.vscdb; fall back to cfg.cursorCookie.
function cursorSessionToken(cfg) {
    for (const path of cursorDbPaths()) {
        try {
            const db = new DatabaseSync(path, { readOnly: true });
            try {
                const row = db
                    .prepare("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'")
                    .get();
                const token = typeof row?.value === 'string' ? JSON.parse(row.value) : null;
                if (typeof token === 'string' && token) {
                    // Cookie format is {userId}::{jwt}; userId comes from the JWT sub claim.
                    const sub = jwtSub(token);
                    if (sub) return `${sub}::${token}`;
                }
            } finally {
                db.close();
            }
        } catch {
            /* try next path / fallback */
        }
    }
    return typeof cfg.cursorCookie === 'string' && cfg.cursorCookie
        ? cfg.cursorCookie
        : null;
}

function jwtSub(jwt) {
    try {
        const payload = JSON.parse(
            Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'),
        );
        // sub looks like "auth0|user_xxx"; the cookie wants the trailing id part.
        const sub = String(payload.sub ?? '');
        return sub.includes('|') ? sub.split('|').pop() : sub || null;
    } catch {
        return null;
    }
}
```

(`loadConfig()` must also pass through `cursorCookie`: return `{ apiBase, token, cursorCookie: file.cursorCookie }` — it currently drops unknown keys.)

- [ ] **Step 2: Implement fetch + sync + backfill branch:**

```js
// Unofficial dashboard endpoint — the only individual route to Cursor usage.
async function cursorFetchEvents(sessionToken, sinceMs) {
    const events = [];
    for (let page = 1; page <= 200; page += 1) {
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
            process.stderr.write(`tokentally: cursor usage fetch failed (${res.status})\n`);
            break;
        }
        const data = await res.json().catch(() => null);
        const batch = data?.usageEvents ?? data?.usageEventsDisplay ?? [];
        if (!Array.isArray(batch) || batch.length === 0) break;
        events.push(...batch);
        if (batch.length < 1000) break;
    }
    return events;
}

async function cursorSync(cfg, opts = {}) {
    const sessionToken = cursorSessionToken(cfg);
    if (!sessionToken) {
        process.stderr.write(
            'tokentally: Cursor not configured (no state.vscdb token or cursorCookie)\n',
        );
        return;
    }
    const sinceMs = opts.sinceMs ?? Date.now() - CATCHUP_DAYS * 86_400_000;
    const events = await cursorFetchEvents(sessionToken, sinceMs);
    const rows = parseCursorEvents(events);
    const { accepted } = await postSessions(cfg, 'cursor', rows, opts.post);
    process.stderr.write(
        `tokentally: cursor synced ${accepted} row(s) from ${events.length} event(s)\n`,
    );
}
```

In `backfill(cfg, only)` add (mirroring existing branches; 90-day cap per spec):

```js
if (only === 'cursor' || only === undefined) {
    await cursorSync(cfg, {
        sinceMs: Date.now() - 90 * 86_400_000,
        post: { path: '/api/history', chunkSize: HISTORY_CHUNK },
    });
}
```

(match the file's actual `only !== 'x'` guard style; extend the allowed `backfill` args in `main()` to include `'cursor'`.)

In `main()` add:

```js
case 'cursor-sync':
    await cursorSync(cfg);
    break;
```

Update the usage string and header comment to mention `cursor-sync` and `backfill [claude|codex|opencode|pi|cursor]`. Wrap `cursorSync` calls so any thrown error is caught, logged to stderr, and the process still exits 0 (match how other commands behave via `main().catch(...)` — check the file's existing error handling at the bottom and follow it).

- [ ] **Step 3: Run full test suite** `pnpm vitest run` — expect PASS (no regressions; new code is import-safe).
- [ ] **Step 4: Manual verify** (requires a machine with Cursor installed): `node reporter/tokentally.mjs cursor-sync` with a valid `~/.tokentally/config.json` → expect either synced rows or a clean stderr message; adjust event-shape field names against the live response if empty.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: cursor-sync reporter command"`

---

### Task 4: Invite gate on `/api/register`

**Files:**
- Modify: `src/types.ts:1-7` (Env)
- Create: `src/lib/invite.ts`
- Modify: `src/routes/register.ts` (check before Turnstile)
- Modify: `.dev.vars` (add `INVITE_KEY=dev-invite`)
- Test: `src/__tests__/invite.test.ts`

**Interfaces:**
- Produces: `inviteAllowed(configuredKey: string | undefined, provided: unknown): Promise<boolean>` in `src/lib/invite.ts`; `Env.INVITE_KEY?: string`; `/api/register` body gains optional `inviteKey`.

- [ ] **Step 1: Write failing tests** — `src/__tests__/invite.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { inviteAllowed } from '../lib/invite';

describe('inviteAllowed', () => {
    it('allows anything when no key configured', async () => {
        expect(await inviteAllowed(undefined, undefined)).toBe(true);
        expect(await inviteAllowed('', 'x')).toBe(true);
    });
    it('rejects missing or wrong key', async () => {
        expect(await inviteAllowed('secret', undefined)).toBe(false);
        expect(await inviteAllowed('secret', 'wrong')).toBe(false);
        expect(await inviteAllowed('secret', 123)).toBe(false);
    });
    it('accepts the exact key', async () => {
        expect(await inviteAllowed('secret', 'secret')).toBe(true);
    });
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/__tests__/invite.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** — `src/lib/invite.ts`:

```ts
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
    for (let i = 0; i < av.length; i += 1) diff |= av[i] ^ bv[i];
    return diff === 0;
}
```

Add `INVITE_KEY?: string;` to `Env` in `src/types.ts`. In `src/routes/register.ts`, extend the body type with `inviteKey?: unknown` and insert **after rate limit, before Turnstile** (cheapest check first, and rate limiting still throttles key guessing):

```ts
const invited = await inviteAllowed(c.env.INVITE_KEY, body.inviteKey);
if (!invited) return c.json({ error: 'invite required' }, 403);
```

(move the `body` parse above the Turnstile call if needed; import `inviteAllowed` from `@/lib/invite`). Append `INVITE_KEY=dev-invite` to `.dev.vars`.

- [ ] **Step 4: Run** `pnpm vitest run` — expect PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: invite-gate username registration"`

---

### Task 5: Start route passes invite state

**Files:**
- Modify: `src/index.tsx:116`

**Interfaces:**
- Consumes: `inviteAllowed` (Task 4).
- Produces: `Start` receives props `{ base: string; invited: boolean; inviteKey: string }` (`inviteKey` is the *user-provided, validated* value to echo into the register call — `''` when ungated or invalid).

- [ ] **Step 1: Implement** — replace the `/start` route:

```tsx
app.get('/start', async (c) => {
    const provided = c.req.query('invite') ?? '';
    const invited = await inviteAllowed(c.env.INVITE_KEY, provided);
    // Only echo the key back when it validated (or gate is off) — never leak attempts.
    const inviteKey = invited && c.env.INVITE_KEY ? provided : '';
    return c.html(
        <Start
            base={baseUrl(c.env, c.req.url)}
            invited={invited}
            inviteKey={inviteKey}
        />,
    );
});
```

(import `inviteAllowed`.) This won't typecheck until Task 6 updates `Start`'s props — Tasks 5 and 6 land as **one commit**; treat this as part A.

- [ ] **Step 2: Continue to Task 6 before committing.**

---

### Task 6: Tabbed start page + agent prompt + gated claim

**Files:**
- Modify: `src/pages/start.tsx` (restructure)
- Modify: `src/pages/ui.ts` only if a tab style helper is added (optional; inline Tailwind classes are fine)

**Interfaces:**
- Consumes: `Start` props from Task 5.
- Produces: public tabbed setup docs; claim form only when `invited`; client script posts `inviteKey` to `/api/register`.

Design (matches existing patterns — server-rendered sections, one inline `clientScript`, `copy` buttons by `data-target`):

- **Always rendered:** hero; "One-time setup" `pre#r-setup`; tab bar + six panels. Every snippet renders server-side with placeholders `YOUR_TOKEN` / `YOUR_USERNAME`; after a successful claim the client script re-renders them with real values (existing `snippets()` mechanism, extended).
- **Tabs:** buttons `data-tab="agent|claude|codex|opencode|pi|cursor"`, panels `id="tab-agent"` etc. Active tab = remove `hidden` class; buttons toggle an active style. Default active: `agent`. Client code:

```js
document.querySelectorAll('button.tab').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('button.tab').forEach((x) => x.classList.toggle('tab-active', x === b));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.id !== 'tab-' + b.dataset.tab));
  });
});
```

- **Agent tab content** (`pre#r-agent` + copy button), text generated by `snippets()`:

```js
const agent =
  'Go to ' + BASE + '/start and help me set up tokentally (token usage leaderboard).\n' +
  'My username: ' + username + '\n' +
  'My token: ' + token + '\n' +
  'Do this for me:\n' +
  '1. Run the one-time setup command from that page (downloads ~/.tokentally/tokentally.mjs and writes config).\n' +
  '2. Detect which coding tools I use (Claude Code / Codex / opencode / pi / Cursor) and configure the matching hooks from the page.\n' +
  '3. Run: node ~/.tokentally/tokentally.mjs backfill\n' +
  '4. Confirm my sessions appear at ' + BASE + '/u/' + username;
```

  Panel copy above the pre: "Paste this into your coding agent — it will read the start page and do the setup for you." When not yet claimed, `username`/`token` are the placeholders.
- **Cursor tab content:** heading "Cursor"; muted text: "Cursor doesn't expose token usage to hooks, so the reporter pulls your usage from Cursor's dashboard API. It auto-reads your Cursor login from local storage — no extra auth in the common case. Add this to `~/.cursor/hooks.json` so every session triggers a sync:" then `pre#r-cursor`:

```js
const cursor = JSON.stringify({
  version: 1,
  hooks: {
    sessionStart: [{ command: 'node ~/.tokentally/tokentally.mjs cursor-sync' }]
  }
}, null, 2);
```

  Below, a smaller muted note: "If auto-auth fails (Cursor not logged in on this machine), copy the `WorkosCursorSessionToken` cookie from cursor.com (DevTools → Application → Cookies) into `~/.tokentally/config.json` as `\"cursorCookie\"`. This uses an unofficial Cursor endpoint, so the cookie may occasionally need refreshing."
- **Claim gating:** when `invited` is false, replace the form panel with `<div class={notice}>Username claims are invite-only. Ask the person who shared tokenmaxer.quest for the invite link.</div>`. When true, render the existing form. Embed the key for the client as `<form id="reg" data-invite={inviteKey}>`; client sends `inviteKey: form.dataset.invite || undefined` in the register body alongside `username` + `turnstileToken`.
- **Existing content moves:** current sections 2a–2d become the claude/codex/opencode/pi tab panels (same copy, same `r-*` ids). Backfill section stays below the tabs, always visible, and gains `cursor` in its list. `snippets()` gains `agent` + `cursor` and is called once on page load with placeholders and again after claim with real values:

```js
function render(username, token) {
  const s = snippets(username, token);
  for (const [k, v] of Object.entries({ 'r-setup': s.setup, 'r-claude': s.claude, 'r-codex': s.codex, 'r-opencode': s.opencode, 'r-pi': s.pi, 'r-cursor': s.cursor, 'r-agent': s.agent })) {
    const el = document.getElementById(k);
    if (el) el.textContent = v;
  }
}
render('YOUR_USERNAME', 'YOUR_TOKEN');
```

  After claim: `render(data.username, data.token)` plus the existing token/profile/result handling. The `#result` block keeps the welcome notice + token pre; the setup tabs are no longer duplicated inside it (delete the per-tool sections from `#result`, link the user to the tabs above or scroll there).

- [ ] **Step 1: Implement** the restructure per above (server component + client script).
- [ ] **Step 2: Typecheck/tests** — `pnpm vitest run` and `npx tsc --noEmit` (or the repo's check script) — expect PASS.
- [ ] **Step 3: Manual verify** — `pnpm dev` (wrangler): `/start` shows tabs + placeholder snippets, no claim form without `?invite=dev-invite`; with it, the form appears; claiming swaps in real token across all tabs; `POST /api/register` without `inviteKey` → 403.
- [ ] **Step 4: Commit (includes Task 5)** — `git add -A && git commit -m "feat: tabbed start page with agent prompt, cursor tab, invite gate"`

---

### Task 7: Docs touch-up

**Files:**
- Modify: `README.md` (sources list / setup mention, if it enumerates sources)
- Modify: reporter header comment (verify done in Task 3)

- [ ] **Step 1:** `grep -n "opencode\|codex" README.md` — mirror any source enumeration to include Cursor; mention invite-only claims in the setup section if registration is described.
- [ ] **Step 2:** `pnpm vitest run` — expect PASS.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "docs: cursor + invite notes"`

---

## Post-plan

- Set the real secret before deploy: `wrangler secret put INVITE_KEY` (generate: `openssl rand -hex 24`). Share `https://tokenmaxer.quest/start?invite=<KEY>` in the group.
- Existing prod users unaffected (register-only gate).
