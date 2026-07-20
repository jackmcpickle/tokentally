# tokenmaxer

Reporter for [tokenmaxer.quest](https://tokenmaxer.quest) — a public leaderboard of
tokens burned with Claude Code, Codex, opencode, pi and Cursor.

A single zero-dependency Node script (`tokentally.mjs`, esbuild-bundled from
strict TypeScript modules under `src/`). It parses your local session
transcripts, sums token usage per model, and POSTs per-session totals to the
tokenmaxer API on SessionStart/SessionEnd hooks.

## What leaves your machine

Per-session **token counts, model names, session ids and timestamps** — never
prompts, code, file contents, file paths, or credentials. Verify yourself:

```sh
tokenmaxer backfill --dry-run     # prints the exact payloads, sends nothing
```

The Cursor session cookie (when used) is sent **only to cursor.com** to read your
own usage dashboard; it never reaches tokenmaxer servers.

## Install

```sh
npm install -g tokenmaxer
mkdir -p ~/.tokenmaxer
printf '%s' '{"apiBase":"https://tokenmaxer.quest","token":"tt_..."}' > ~/.tokenmaxer/config.json
```

Legacy installs that still use `~/.tokentally/config.json` (or `TOKENTALLY_*`
env vars) keep working; new setups should use `~/.tokenmaxer` and `TOKENMAXER_*`.

Get a token and hook config at <https://tokenmaxer.quest/start> (or
`curl https://tokenmaxer.quest/start.md`).

## Usage

```
tokenmaxer claude-sessionstart|claude-sessionend
tokenmaxer codex-sessionstart
tokenmaxer opencode-sessionstart
tokenmaxer pi-sessionstart
tokenmaxer cursor-sync
tokenmaxer backfill [claude|codex|opencode|pi|cursor] [--dry-run]
tokenmaxer set-profile-url <https-url> [--dry-run]
tokenmaxer set-profile-url --clear [--dry-run]
```

Reporting is idempotent (upsert keyed by session id) — re-running never
double-counts. Source: <https://github.com/jackmcpickle/tokenmaxer>.

## Claude subagent sessions

Claude Code splits one session across a root `<sessionId>.jsonl` and subagent
transcripts under `<sessionId>/subagents/` (nesting deeper for workflow
subagents), all sharing the same session id. The reporter aggregates a
session's files into a single row per model — deduplicating streamed message
chunks across copies — before uploading, so the files can't overwrite each
other's totals on the server, and it never uploads a session's row unless
every known contribution was readable. Because the aggregated rows keep the
same session ids, upgrading and re-running `tokenmaxer backfill claude`
repairs any previously collided history in place.

## Codex subagent sessions

Codex subagent/fork children replay part of the parent rollout's history
(including its token counts) at the top of the child file. The parser excludes
that inherited prefix so parent usage is only counted once: current rollouts
are cut at the `trigger_turn` boundary marker; older files without the marker
are resolved by matching the child's initial token sequence against the parent
rollout, which is read **locally only** — nothing extra leaves your machine.

Excluded replay still reports a zero-total row for each affected model, so
re-running `tokenmaxer backfill codex` overwrites any rows that older reporter
versions inflated for those sessions.

## Cursor manual auth fallback

`cursor-sync` normally reads your Cursor login from Cursor's local
`state.vscdb`. If that fails (Cursor not logged in on this machine), copy the
`WorkosCursorSessionToken` cookie from cursor.com (DevTools → Application →
Cookies) into `~/.tokenmaxer/config.json` as `"cursorCookie"`. It is sent only
to cursor.com and may occasionally need refreshing (unofficial endpoint).
