# Cursor support + tabbed start page — design

Date: 2026-07-18

## Goal

Three related changes to onboarding:

1. Restructure the post-claim setup on `/start` into **tabs**, and add a first
   tab holding a **copyable agent prompt** (embeds the user's token) that tells an
   AI coding agent to open the start page and do the setup.
2. Add **Cursor** as a supported source — end to end (reporter + server + UI).
3. **Invite-gate username creation.** Setup instructions stay public, but
   claiming a username requires an invite key passed as a URL param
   (`/start?invite=<KEY>`) — one shared, unguessable link the owner can drop in a
   WhatsApp group. The key is a server secret, never rendered into the public
   page or leaderboard.

## Background / constraints (researched)

- Cursor **has hooks** (`~/.cursor/hooks.json`, events incl. `sessionStart`,
  `sessionEnd`, `stop`; stdin JSON with `transcript_path`, `conversation_id`,
  `model`) — but the hook payload carries **no token usage**, and local
  transcripts don't reliably record token counts. So the Claude/Codex model
  (hook parses a local transcript) **cannot work for Cursor**.
- No **official individual** usage API. The Admin API
  (`api.cursor.com/teams/filtered-usage-events`, real `tokenUsage`) is
  **team-admin only**.
- The only individual route to real token data is **unofficial**: replay
  `cursor.com/api/usage` / dashboard endpoints authenticated with the user's
  Cursor session token.
- A **VS Code/Cursor extension unlocks nothing official** — `vscode.lm` only
  sees the extension's own model calls; Cursor has no extension usage API. An
  extension's only advantage is auto-auth by reading Cursor's local SQLite
  `state.vscdb` — which **our reporter can do itself**, since it already runs on
  the user's machine with full filesystem access. Decision: **no extension.**

## Decision

Add a `cursor-sync` command to the reporter that:

1. **Auto-auths**: reads `cursorAuth/accessToken` from Cursor's local SQLite
   `state.vscdb` (`ItemTable`). Falls back to a `cursorCookie` value in
   `~/.tokentally/config.json` if the DB read fails.
2. **Pulls usage**: calls Cursor's dashboard usage endpoint over the catch-up
   window, paginating until events are exhausted.
3. **Maps → rows**: buckets events by **UTC day + model** → synthetic
   `session_id = "cursor-YYYY-MM-DD"`, `started_at` = day start, tokens summed
   per model. Re-summing the whole day each run keeps it idempotent (server
   upserts by session_id + model, same as claude/codex). Cursor gives no
   reasoning tokens; that field stays 0.
4. Never blocks a hook: any failure (no token, expired, network) → clear stderr
   message, exit 0.

Trigger: Cursor hooks carry no tokens, so `~/.cursor/hooks.json` runs
`node ~/.tokentally/tokentally.mjs cursor-sync` on `sessionStart` purely as a
trigger to pull. Also runnable manually and via `backfill cursor`.

## Components

### Reporter (`reporter/tokentally.mjs`) — zero-dep, Node >=24

- `cursorDbPaths()` — candidate `state.vscdb` locations (macOS
  `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`, Linux
  `~/.config/Cursor/...`, Windows `%APPDATA%\Cursor\...`).
- `cursorToken(cfg)` — open `state.vscdb` read-only via **`node:sqlite`**
  (built-in in Node 24), `SELECT value FROM ItemTable WHERE key='cursorAuth/accessToken'`;
  on any failure return `cfg.cursorCookie`. `node:sqlite` streams from disk so
  the 1–2 GB DB size is fine; opened read-only so it can't corrupt Cursor state.
- `cursorFetchEvents(cfg, token, sinceMs)` — POST the dashboard usage endpoint
  with the token (as `WorkosCursorSessionToken` cookie / Bearer) + matching
  `Origin` header; paginate; return raw events. Exact endpoint/body verified
  during implementation against a live response; built defensively (tolerate
  shape changes, skip malformed events).
- `parseCursorEvents(events)` — bucket by UTC day + model into the standard
  `{ session_id, model, started_at, ...totals }` rows. Unit-testable pure
  function (mirrors `parseCodexRollout` testing).
- `cursorSync(cfg)` command + `backfill cursor` (90-day window, posts to
  `/api/history`).
- Add `cursor-sync` to the `main()` switch and usage string; document in header
  comment.

### Server

- `src/types.ts` — add `'cursor'` to `Source`, `SOURCES`, `isSource`.
- `src/lib/validate.ts` — accept `cursor`; update error message.
- `src/pages/profile.tsx` — label `cursor: 'Cursor'`.
- `src/pages/home.tsx` — add a `cursor` filter option.
- Model-family unchanged (Cursor uses claude/gpt model ids, already handled).

### Invite gate

Goal: setup docs stay public; **claiming a username** requires a shared secret
passed via URL param. One link, many people — but unguessable and never exposed
in the public page.

- **Secret:** `INVITE_KEY` in `Env` (Cloudflare secret via `wrangler secret` /
  `.dev.vars`). Not committed. A long random string.
- **Start route** (where `Start` is rendered): read `c.req.query('invite')`,
  constant-time compare to `c.env.INVITE_KEY`, pass an `invited: boolean` prop to
  the component. When `INVITE_KEY` is unset (local/dev), treat as **not gated**
  (invited = true) so dev isn't blocked — documented in the route.
- **`Start` component** renders the setup tabs **always**; renders the claim form
  + "For your agent" prompt **only when `invited`**. When not invited, show a
  brief notice ("Username claims are invite-only — ask for an invite link") in
  place of the form. The invite key is passed through only via the form's hidden
  handoff to the register call — never printed into the leaderboard or any public
  route.
- **`/api/register`** gains invite validation: read `inviteKey` from the request
  body, constant-time compare to `c.env.INVITE_KEY`; missing/wrong → `403`.
  Keeps existing Turnstile + rate-limit checks (invite check first, cheapest).
  When `INVITE_KEY` is unset, skip the check (matches dev behavior above).
- **Client script:** read `invite` from `location.search`, include it in the
  `/api/register` body alongside `username` + `turnstileToken`.

Note: an invite key in a URL is shareable-but-leakable by nature (that's the
requirement — one link for a WhatsApp group). It is *not* per-user and grants no
account access on its own; it only unlocks the claim form + register endpoint.
Rotating it (change the secret) invalidates old links.

### Start page (`src/pages/start.tsx`)

- **Setup instructions are always available** (public), shown with placeholder
  token/username (e.g. `<YOUR_TOKEN>`) until a claim fills them in. This means
  the tabbed setup section renders regardless of invite state; only the claim
  form + real token/agent-prompt are gated.
- Keep the shared **one-time setup** (curl + write config) above the tabs.
- Convert the setup into **lightweight inline tabs** — buttons that toggle panels
  via the existing client `<script>` (no dependency, matches current copy-button
  pattern). Tabs:
  1. **For your agent** (default) — copyable prompt embedding username + token +
     base URL, e.g. *"Go to `<BASE>/start` and help me set up tokentally.
     Username: X, token: Y. Run the one-time setup and configure hooks for
     whichever editors I use (Claude Code / Codex / Cursor)."* Placeholder token
     until claimed.
  2. **Claude Code** — existing hooks JSON.
  3. **Codex** — existing TOML.
  4. **Cursor** — `~/.cursor/hooks.json` snippet running `cursor-sync`; note that
     the token is auto-read from Cursor's local storage, with a concise fallback
     (paste `WorkosCursorSessionToken` into config if auto-auth fails); honest
     note that this uses Cursor's unofficial dashboard endpoint so it may need
     the fallback cookie occasionally.
- On claim, the existing JS swaps placeholders for the real token/username across
  all tabs (extends the current `r-*` element updates).
- Backfill note gains a `cursor` mention.

## Testing

- Unit: `parseCursorEvents` — day/model bucketing, empty input, malformed events,
  token field mapping. Add to `src/__tests__/reporter.test.ts` (imports from the
  reporter, like the codex tests).
- Unit: `validate` accepts `cursor`; `isSource('cursor')` true.
- Register route: rejects missing/wrong `inviteKey` with 403; accepts correct
  key; skips check when `INVITE_KEY` unset.
- Manual: `/start` without `?invite=` shows docs but no claim form; with correct
  key shows the form; wrong key stays gated.
- Manual: run `cursor-sync` against a real Cursor install; confirm rows appear on
  the profile and re-running doesn't double-count.

## Error handling

- Missing/expired token, no `state.vscdb`, network error, non-200 → stderr note,
  exit 0 (never break a hook).
- SQLite open failure → fall back to `cursorCookie`; if that's also absent, note
  "Cursor not configured" and exit 0.

## Explicitly out of scope (YAGNI)

- VS Code/Cursor extension.
- Cursor Admin API / team support.
- Real-time per-session Cursor tracking (day-bucket granularity only).

## Unresolved questions

1. Cursor tab: cookie-extraction steps inline or link out? (default: brief inline
   fallback, since auto-auth is the common path)
2. `cursor-sync` trigger: `sessionStart` only, or also `stop`? (default:
   `sessionStart` only)
3. Cursor backfill window cap? (default: 90 days)
4. Single static `INVITE_KEY`, or support rotating/multiple keys later?
   (default: single static secret; rotate by changing it)
