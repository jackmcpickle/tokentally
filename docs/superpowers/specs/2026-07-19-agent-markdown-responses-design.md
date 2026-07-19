# Agent Markdown Responses — Design

Date: 2026-07-19  
Status: approved for planning  
Stack: Hono on Cloudflare Workers (origin-side only)

## Goal

Serve LLM-friendly Markdown (and well-known `llms.txt` indexes) for non-browser clients — curl, AI agents, missing/`*/*` Accept — while browsers keep the existing HTML UI. Prefer explicit content modules over HTML→Markdown conversion.

## Background (what is normally done)

De facto stack (2024–2026):

1. **`/llms.txt`** (+ optional `/llms-full.txt`) — curated Markdown index ([llmstxt.org](https://llmstxt.org/)).
2. **`.md` URL twins** — same path with `.md` appended (part of the llms.txt proposal; used by Mintlify, Cloudflare Docs).
3. **`Accept: text/markdown` negotiation** — RFC 9110; Mintlify (origin), Cloudflare “Markdown for Agents” (edge).
4. **Discovery headers** — `Link` / `X-Llms-Txt` pointing at `/llms.txt` (Mintlify).

Not relied on as the primary switch: User-Agent bot lists alone, or “missing `Content-Type`” (GET browsers rarely send `Content-Type`; that would mis-classify humans).

## Decisions

| Topic               | Choice                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Approach            | Hand-authored Markdown modules + Hono helpers                                                      |
| Scope               | `/`, `/about`, `/start`, `/u/:username` + `llms.txt` / `llms-full.txt`; JSON API linked from index |
| Home MD default     | Top **10**, window **`7d`**, all stats in a Markdown table                                         |
| Profiles            | Markdown via `/u/:username.md` or negotiation                                                      |
| Start invite        | Same gate as HTML (`inviteSessionAllowed` + cookie)                                                |
| Negotiation host    | Origin (Hono) only — no Cloudflare edge Markdown-for-Agents dependency                             |
| Non-browser default | Markdown unless request looks like a browser (lightweight heuristic)                               |

## Architecture

```
src/lib/agent-markdown.ts     # isBrowserRequest, prefersMarkdown, response helpers
src/content/
  llms.ts                     # /llms.txt body
  llms-full.ts                # /llms-full.txt body
  about.md.ts                 # about prose
  start.md.ts                 # start guide
  home.md.ts                  # renderLeaderboardMd(entries, filters)
  profile.md.ts               # renderProfileMd(profile)
src/index.tsx                 # routes + negotiation branch on HTML pages
src/__tests__/agent-markdown.test.ts
```

Shared render functions are called from both `*.md` routes and negotiated HTML routes (no duplicated fetch logic).

## Routes

| Request                                                       | Response                                          |
| ------------------------------------------------------------- | ------------------------------------------------- |
| `GET /llms.txt`                                               | Curated index — `text/plain; charset=utf-8`       |
| `GET /llms-full.txt`                                          | Concatenated corpus — `text/plain; charset=utf-8` |
| `GET /about.md`, `/start.md`, `/index.md`                     | Page Markdown — `text/markdown; charset=utf-8`    |
| `GET /u/:username.md`                                         | Profile Markdown                                  |
| Same paths without `.md` when not a browser (see negotiation) | Same Markdown body                                |
| Browser (or explicit HTML preference)                         | Existing HTML                                     |
| JSON `/api/*`                                                 | Unchanged                                         |

### Negotiation rules

**Default representation for page routes is Markdown.**

Serve **HTML** only when the request looks like a browser:

- `Accept` includes `text/html`, **or**
- `Sec-Fetch-Mode` request header is present

Otherwise serve **Markdown**. This covers:

- curl (`Accept: */*`, has UA) → Markdown
- missing `Accept` → Markdown
- missing `User-Agent` → Markdown (unless `Accept` has `text/html` or `Sec-Fetch-Mode` is set)
- agents sending `Accept: text/markdown` → Markdown

Explicit `.md` / `llms*.txt` routes always return Markdown/plain text regardless of headers.

**Headers on negotiated page responses:**

- `Content-Type: text/markdown; charset=utf-8` (or `text/plain` for llms*)
- `Vary: Accept, Sec-Fetch-Mode`
- `Link: </llms.txt>; rel="describedby"` (and optional `X-Llms-Txt: /llms.txt`) on HTML and Markdown page responses

Heuristic is intentionally lightweight — not spoof-proof.

### Invite gate (`/start`, `/start.md`)

Reuse `inviteSessionAllowed` + invite cookie (same as HTML `/start`).

If not invited: `403` with short plain text, e.g.:

```markdown
# Invite required

Open `/invite?invite=…` in a browser first, then retry.
```

### Profile miss

`404` plain text (not HTML layout) when Markdown is being served.

## Content shape

### `/llms.txt`

Per [llmstxt.org](https://llmstxt.org/): H1, blockquote summary, then H2 sections with absolute links.

- **Docs** — `/index.md`, `/about.md`, `/start.md` (note invite), example profile pattern
- **API** — existing JSON endpoints (`/api/leaderboard`, `/api/u/:username`, register/ingest/history as relevant)
- **Optional** — lower-priority links if any

### Home Markdown

```markdown
# tokenmaxer.quest

> Token leaderboard for AI builders. Default: top 10 · last 7 days · all sources.

| Rank | Username | Sessions | Input | Output | Cache read | Cache write | Reasoning | Total | Est. cost |
| ---- | -------- | -------- | ----: | -----: | ---------: | ----------: | --------: | ----: | --------: |
| …    | …        | …        |     … |      … |          … |           … |         … |     … |         … |

Query filters: `?window=7d|30d|today|all&source=…&model=…`
For structured data prefer `GET /api/leaderboard`.
```

- Defaults: `limit=10`, `window=7d`; show **all** numeric columns (metric filter does not collapse columns).
- Honor `window` / `source` / `model` query params like HTML.
- Format numbers with existing `formatTokens` / `formatUsd` (same compact style as the HTML UI).

### Profile Markdown

Totals + per-model breakdown table; link back to `/llms.txt` and `/api/u/:username`.

### About / Start

Same facts as HTML pages, clean Markdown, no chrome. Start body only after invite check.

### `/llms-full.txt`

Concatenate: about Markdown + start Markdown (full guide text; live `/start.md` remains invite-gated) + short API notes + pointer that the live leaderboard is at `/index.md` and `/api/leaderboard`. Keep the file small enough for a single agent context load (target under ~50 KB).

## Testing

`src/__tests__/agent-markdown.test.ts` (and small content render tests):

- Browser-like Accept (`text/html,…`) → not Markdown path
- `Sec-Fetch-Mode: navigate` → HTML path
- curl-like (`Accept: */*` or absent, no Sec-Fetch) → Markdown
- Explicit `Accept: text/markdown` → Markdown
- Home MD defaults top 10 / 7d; all columns present; `?window=` respected
- Profile MD 200 / 404 text
- `/start.md` gated: no cookie → 403 text; session → 200
- `/llms.txt` structure + absolute links
- `Vary` / `Content-Type` / discovery headers set appropriately

## Out of scope

- Cloudflare dashboard “Markdown for Agents” edge conversion
- Robust bot/UA databases
- Content Signals / robots.txt changes
- Putting `.md` URLs in a sitemap
- Changing JSON API contracts
- HTML→Markdown libraries

## Implementation notes

- Factor page handlers so HTML and Markdown share data loading (`getLeaderboard`, `getProfile`, invite checks).
- Prefer absolute URLs in `llms.txt` via existing `baseUrl(env, url)`.
- Do not embed “fetch the .md version” hints inside Markdown bodies (avoid agent loops).
- Optional: `<link rel="alternate" type="text/markdown" href="…">` in HTML layout for discovery — nice-to-have, not required for v1.
