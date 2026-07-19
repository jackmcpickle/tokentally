# tokenmaxer

Reporter for [tokenmaxer.quest](https://tokenmaxer.quest) — a public leaderboard of
tokens burned with Claude Code, Codex, opencode, pi and Cursor.

A single zero-dependency Node script (`tokentally.mjs`, ~1000 lines — read it).
It parses your local session transcripts, sums token usage per model, and POSTs
per-session totals to the tokenmaxer API on SessionStart/SessionEnd hooks.

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

## Cursor manual auth fallback

`cursor-sync` normally reads your Cursor login from Cursor's local
`state.vscdb`. If that fails (Cursor not logged in on this machine), copy the
`WorkosCursorSessionToken` cookie from cursor.com (DevTools → Application →
Cookies) into `~/.tokenmaxer/config.json` as `"cursorCookie"`. It is sent only
to cursor.com and may occasionally need refreshing (unofficial endpoint).
