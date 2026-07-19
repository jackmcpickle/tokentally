# tokenmaxer.quest

A public leaderboard of the tokens AI builders burn with **Claude Code**, **Codex**,
**opencode**, **pi** and **Cursor**. Pick a username, paste a couple of snippets, and your coding
sessions self-report their token usage to the board. No email, no PII — just token
counts.

It's a single [Hono](https://hono.dev) worker on Cloudflare that serves both the JSON
API and the server-rendered site, backed by one D1 database.

## How it works

These tools don't hand token counts to hooks — they only point at local session
files. So the installed **reporter** (`reporter/tokentally.mjs`, a zero-dependency
Node script published on npm as [`tokenmaxer`](https://www.npmjs.com/package/tokenmaxer))
reads those files, sums usage per model, and POSTs the totals — the same
files [`ccusage`](https://ccusage.com) parses.

**What leaves the machine:** per-session token counts, model names, session ids,
and timestamps — never prompts, code, file paths, or credentials. Append
`--dry-run` to any reporter command to print the exact payloads instead of
sending them.

- **Claude Code** — `~/.claude/projects/**/<session>.jsonl` → `message.usage.*`
- **Codex** — `~/.codex/sessions/**/rollout-*.jsonl` → last `token_count` event
- **opencode** — `~/.local/share/opencode/storage/message/<session>/*.json` → `tokens.*`
  on each assistant message
- **pi** — `~/.pi/agent/sessions/**/*.jsonl` → `usage` on each assistant record
  (deduped by `id`, since pi stores a branching tree)
- **Cursor** — dashboard API fetch via local auth (reporter calls `cursor-sync`)

Reporting fires on Claude Code / Codex **SessionStart** / **SessionEnd** hooks (no cron,
no daemon). opencode and pi have no shell hooks, so a small **shell wrapper function**
runs the reporter each time they exit. Every session is keyed by its id and the server
**upserts** rather than adds, so re-reporting the same session never double-counts —
which is what makes combining start + end (and the start-only catch-ups) safe.

Token counts are **self-reported** — this is an honor system with light guardrails
(bearer auth, rate limits, sanity caps). See `/about`.

## Project layout

```
src/
  index.tsx          # Hono app: API routes + HTML pages + serves the reporter
  types.ts           # Env bindings + shared types
  routes/            # register, ingest, leaderboard (JSON API)
  pages/             # hono/jsx server-rendered pages
  lib/               # auth, pricing, ratelimit, validate, aggregate, format
  db/… drizzle/      # D1 schema + migrations
  __tests__/         # vitest unit tests
reporter/tokentally.mjs   # the reporter (npm package `tokenmaxer`; also served at /tokentally.mjs)
```

## API

| Method | Path                | Auth   | Purpose                                             |
| ------ | ------------------- | ------ | --------------------------------------------------- |
| POST   | `/api/register`     | —      | `{username}` → `{id, username, token}`              |
| POST   | `/api/token/rotate` | Bearer | rotate your token                                   |
| POST   | `/api/ingest`       | Bearer | upsert `{source, sessions[]}` (live reporting)      |
| POST   | `/api/history`      | Bearer | bulk backfill `{source, sessions[]}` (past history) |
| POST   | `/api/profile`      | Bearer | set/clear `{url}` (https public profile link)       |
| GET    | `/api/leaderboard`  | —      | `?window=&metric=&source=&model=&limit=`            |
| GET    | `/api/u/:username`  | —      | profile totals + breakdown                          |
| GET    | `/api/health`       | —      | `{name, version}`                                   |

`window` ∈ `today|7d|30d|all`, `metric` ∈ `total|input|output|cached|cost`, `source` ∈ `claude_code|codex|opencode|pi|cursor`.

## Agent-readable pages

Non-browser clients (e.g. `curl`) get Markdown by default on `/`, `/about`,
`/start`, and `/u/:username`. Browsers still get HTML. Explicit twins:

- `/llms.txt`, `/llms-full.txt`
- `/index.md`, `/about.md`, `/start.md`, `/u/:username.md`

`/start.md` requires the invite session cookie when `INVITE_KEY` is set.

## Development

```sh
pnpm install
pnpm db:migrate:local           # apply migrations to local D1
pnpm dev                        # wrangler dev on :8787
pnpm test                       # vitest
pnpm typecheck
```

## Deploy

```sh
wrangler d1 create tokentally                       # paste database_id into wrangler.toml
wrangler kv namespace create RATE_LIMIT             # paste id into wrangler.toml
pnpm db:migrate                                     # apply migrations to remote D1
# optionally set PUBLIC_BASE_URL in wrangler.toml [vars]
pnpm deploy
```

## Onboarding (what users paste)

Username claims are invite-only via a shared invite link at `/invite?token=<KEY>` (sets a session cookie, then redirects home; claim the username at `/start`).

After claiming a username at `/start`, users get a personalized version of:

```sh
npm install -g tokenmaxer && \
  mkdir -p ~/.tokenmaxer && \
  printf '%s' '{"apiBase":"https://<host>","token":"tt_..."}' > ~/.tokenmaxer/config.json
```

**Claude Code** — merge into `~/.claude/settings.json`:

```json
{
    "hooks": {
        "SessionStart": [
            {
                "type": "shell",
                "command": "tokenmaxer claude-sessionstart"
            }
        ],
        "SessionEnd": [
            {
                "type": "shell",
                "command": "tokenmaxer claude-sessionend"
            }
        ]
    }
}
```

**Codex** — add to `~/.codex/config.toml` (Codex has no SessionEnd hook, so the latest
session reports on the next launch):

```toml
[[hooks.SessionStart.hooks]]
type = "command"
command = "tokenmaxer codex-sessionstart"
```

**opencode** — opencode has no shell hooks, so add a wrapper to `~/.bashrc`/`~/.zshrc`
that reports your latest sessions each time opencode exits:

```sh
opencode() { command opencode "$@"; tokenmaxer opencode-sessionstart; }
```

**pi** — same idea for pi:

```sh
pi() { command pi "$@"; tokenmaxer pi-sessionstart; }
```

The token lives only in `~/.tokenmaxer/config.json`, never in shared settings files.
(Legacy `~/.tokentally/config.json` and `TOKENTALLY_*` env vars still work as fallbacks.)

## Backfilling past history

The hooks only report sessions going forward (`SessionStart` catch-up scans the last
`TOKENMAXER_DAYS`, default 3). To load everything you ran _before_ installing tokenmaxer,
run the one-time backfill — it computes token-count summaries from all local
Claude Code / Codex / opencode / pi / Cursor transcripts and uploads only those summaries:

```sh
tokenmaxer backfill --dry-run    # print payloads, send nothing
tokenmaxer backfill              # all tools
tokenmaxer backfill claude      # Claude Code only (same for codex|opencode|pi|cursor)
tokenmaxer set-profile-url https://github.com/YOU   # optional public link on /u/YOU
tokenmaxer set-profile-url --clear
```

Backfill posts to a dedicated **`POST /api/history`** endpoint (Bearer auth) rather than
`/api/ingest`. It's a separate route with its own rate-limit bucket and a larger
per-request cap, so a big one-time upload doesn't eat into the live reporting budget.
Uploads are the same idempotent upsert as `/api/ingest` — keyed by session id — so it's
safe to run backfill while the hooks are active and safe to re-run.

## Pricing

Estimated USD cost uses a hardcoded per-model table in `src/lib/pricing.ts` — update
it and redeploy when prices change. Values are estimates, not billing truth.
