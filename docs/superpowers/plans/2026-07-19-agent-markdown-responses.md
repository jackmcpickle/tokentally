# Agent Markdown Responses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve Markdown (and `/llms.txt`) from the Hono origin for non-browser clients, with `.md` twins, browser detection, and live top-10 / profile tables.

**Architecture:** Pure content modules under `src/content/` build Markdown strings. `src/lib/agent-markdown.ts` decides browser vs agent and builds responses with `Vary` / discovery headers. A small Hono sub-app `src/routes/agent-pages.ts` owns `llms*.txt` and `*.md` routes; `src/index.tsx` mounts it and branches HTML page handlers when the client is not a browser.

**Tech Stack:** Cloudflare Workers, Hono, Vitest, existing `getLeaderboard` / `getProfile` / invite cookie helpers.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-19-agent-markdown-responses-design.md`.
- Origin-only negotiation — do not depend on Cloudflare “Markdown for Agents”.
- HTML only when `Accept` contains `text/html` **or** `Sec-Fetch-Mode` is present; otherwise Markdown (curl/`*/*` → MD).
- `/start.md` uses the same invite cookie gate as HTML `/start`; uninvited → `403` plain text.
- Home Markdown defaults: `limit=10`, `window=7d`, all stat columns; honor `window`/`source`/`model` query params.
- Absolute URLs in `llms.txt` via `baseUrl` pattern already in `src/index.tsx`.
- Do not put “fetch the .md version” instructions inside Markdown bodies.
- Tests: `pnpm vitest run <file>`. Lint/format: `pnpm lint` / `pnpm fmt`. Typecheck: `pnpm typecheck`.
- Commit messages: concise `feat:` / `test:` / `docs:` style.

## File map

| File                                   | Responsibility                                          |
| -------------------------------------- | ------------------------------------------------------- |
| `src/lib/agent-markdown.ts`            | `isBrowserRequest`, response helpers, discovery headers |
| `src/content/about.md.ts`              | About page Markdown                                     |
| `src/content/start.md.ts`              | Start guide Markdown (+ invite-required stub)           |
| `src/content/home.md.ts`               | Leaderboard → Markdown table                            |
| `src/content/profile.md.ts`            | Profile → Markdown                                      |
| `src/content/llms.ts`                  | `/llms.txt` body                                        |
| `src/content/llms-full.ts`             | `/llms-full.txt` body                                   |
| `src/routes/agent-pages.ts`            | Hono routes for llms + `.md`                            |
| `src/index.tsx`                        | Mount agent routes; branch HTML handlers                |
| `src/__tests__/agent-markdown.test.ts` | Detection + headers                                     |
| `src/__tests__/agent-content.test.ts`  | Content renderers + llms shape                          |
| `src/__tests__/agent-pages.test.ts`    | Sub-app request tests (mock D1 where needed)            |

---

### Task 1: Browser detection + response helpers

**Files:**

- Create: `src/lib/agent-markdown.ts`
- Test: `src/__tests__/agent-markdown.test.ts`

**Interfaces:**

- Produces:
    - `isBrowserRequest(req: Request): boolean`
    - `markdownBody(body: string, init?: { status?: number }): Response` — `text/markdown; charset=utf-8`, `Vary: Accept, Sec-Fetch-Mode`, discovery headers
    - `plainBody(body: string, init?: { status?: number }): Response` — `text/plain; charset=utf-8`, same Vary + discovery
    - `withAgentDiscovery(headers: Headers): void` — sets `Link: </llms.txt>; rel="describedby"` and `X-Llms-Txt: /llms.txt`
    - `INVITE_REQUIRED_MD` constant string for 403 start responses

- [ ] **Step 1: Write failing tests** in `src/__tests__/agent-markdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
    INVITE_REQUIRED_MD,
    isBrowserRequest,
    markdownBody,
    plainBody,
} from '@/lib/agent-markdown';

function req(headers: Record<string, string>): Request {
    return new Request('https://tokenmaxer.quest/', { headers });
}

describe('isBrowserRequest', () => {
    it('is true when Accept includes text/html', () => {
        expect(
            isBrowserRequest(
                req({
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                }),
            ),
        ).toBe(true);
    });

    it('is true when Sec-Fetch-Mode is present', () => {
        expect(
            isBrowserRequest(
                req({ Accept: '*/*', 'Sec-Fetch-Mode': 'navigate' }),
            ),
        ).toBe(true);
    });

    it('is false for curl-like Accept */* without Sec-Fetch', () => {
        expect(
            isBrowserRequest(
                req({ Accept: '*/*', 'User-Agent': 'curl/8.7.1' }),
            ),
        ).toBe(false);
    });

    it('is false when Accept is missing', () => {
        expect(isBrowserRequest(req({}))).toBe(false);
    });

    it('is false for Accept: text/markdown', () => {
        expect(isBrowserRequest(req({ Accept: 'text/markdown' }))).toBe(false);
    });
});

describe('markdownBody / plainBody', () => {
    it('sets markdown content-type, Vary, and discovery headers', async () => {
        const res = markdownBody('# Hi\n');
        expect(res.headers.get('Content-Type')).toBe(
            'text/markdown; charset=utf-8',
        );
        expect(res.headers.get('Vary')).toBe('Accept, Sec-Fetch-Mode');
        expect(res.headers.get('Link')).toContain('/llms.txt');
        expect(res.headers.get('X-Llms-Txt')).toBe('/llms.txt');
        expect(await res.text()).toBe('# Hi\n');
    });

    it('sets text/plain for plainBody', () => {
        const res = plainBody('# llms\n');
        expect(res.headers.get('Content-Type')).toBe(
            'text/plain; charset=utf-8',
        );
    });

    it('honors status', () => {
        expect(markdownBody(INVITE_REQUIRED_MD, { status: 403 }).status).toBe(
            403,
        );
    });
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/__tests__/agent-markdown.test.ts`  
      Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `src/lib/agent-markdown.ts`:

```ts
export const INVITE_REQUIRED_MD = `# Invite required

Open \`/invite?invite=…\` in a browser first, then retry.
`;

export function isBrowserRequest(req: Request): boolean {
    const accept = req.headers.get('accept');
    if (accept && /text\/html/i.test(accept)) return true;
    if (req.headers.get('sec-fetch-mode')) return true;
    return false;
}

function withAgentDiscovery(headers: Headers): void {
    headers.set('Link', '</llms.txt>; rel="describedby"');
    headers.set('X-Llms-Txt', '/llms.txt');
    headers.set('Vary', 'Accept, Sec-Fetch-Mode');
}

export function markdownBody(
    body: string,
    init?: { status?: number },
): Response {
    const headers = new Headers({
        'Content-Type': 'text/markdown; charset=utf-8',
    });
    withAgentDiscovery(headers);
    return new Response(body, { status: init?.status ?? 200, headers });
}

export function plainBody(body: string, init?: { status?: number }): Response {
    const headers = new Headers({
        'Content-Type': 'text/plain; charset=utf-8',
    });
    withAgentDiscovery(headers);
    return new Response(body, { status: init?.status ?? 200, headers });
}
```

- [ ] **Step 4: Run** `pnpm vitest run src/__tests__/agent-markdown.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-markdown.ts src/__tests__/agent-markdown.test.ts
git commit -m "$(cat <<'EOF'
feat: add agent Markdown negotiation helpers

EOF
)"
```

---

### Task 2: About + start Markdown content

**Files:**

- Create: `src/content/about.md.ts`
- Create: `src/content/start.md.ts`
- Test: `src/__tests__/agent-content.test.ts` (start this file; more tasks append)

**Interfaces:**

- Produces:
    - `aboutMarkdown(): string`
    - `startMarkdown(base: string): string` — setup guide with `YOUR_USERNAME` / `YOUR_TOKEN` placeholders and absolute `base` in curl/snippet URLs

- [ ] **Step 1: Write failing tests** — create `src/__tests__/agent-content.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { aboutMarkdown } from '@/content/about.md';
import { startMarkdown } from '@/content/start.md';

describe('aboutMarkdown', () => {
    it('has title and core sections', () => {
        const md = aboutMarkdown();
        expect(md).toMatch(/^# About tokenmaxer\.quest/m);
        expect(md).toContain('## What it tracks');
        expect(md).toContain('## Where the numbers come from');
        expect(md).toContain('## The honest part');
        expect(md).toContain('## Accounts & privacy');
        expect(md).toContain('Claude Code');
        expect(md).toContain('Cursor');
    });
});

describe('startMarkdown', () => {
    it('includes setup placeholders and tool sections', () => {
        const md = startMarkdown('https://tokenmaxer.quest');
        expect(md).toMatch(/^# Get started/m);
        expect(md).toContain('YOUR_USERNAME');
        expect(md).toContain('YOUR_TOKEN');
        expect(md).toContain('https://tokenmaxer.quest/tokentally.mjs');
        expect(md).toContain('## Agent prompt');
        expect(md).toContain('## Claude Code');
        expect(md).toContain('## Codex');
        expect(md).toContain('## opencode');
        expect(md).toContain('## pi');
        expect(md).toContain('## Cursor');
        expect(md).toContain('POST /api/register');
    });
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/__tests__/agent-content.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement content modules**

`src/content/about.md.ts` — return a Markdown string mirroring `src/pages/about.tsx` facts (include Cursor alongside Claude Code / Codex / opencode / pi). No HTML chrome, no “fetch .md” hints.

`src/content/start.md.ts` — function `startMarkdown(base: string)` documenting:

1. Claim via `POST /api/register` (invite cookie required when gate on)
2. One-time setup curl using `${base}/tokentally.mjs` and placeholders
3. Per-tool hook snippets (same commands as HTML start page client script)
4. Agent prompt section
5. `backfill` note

Keep snippets as fenced code blocks. Mirror the shell/JSON from `src/pages/start.tsx` `snippets()` (lines ~25–61).

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/about.md.ts src/content/start.md.ts src/__tests__/agent-content.test.ts
git commit -m "$(cat <<'EOF'
feat: add about and start Markdown content modules

EOF
)"
```

---

### Task 3: `llms.txt` + `llms-full.txt`

**Files:**

- Create: `src/content/llms.ts`
- Create: `src/content/llms-full.ts`
- Modify: `src/__tests__/agent-content.test.ts`

**Interfaces:**

- Consumes: `aboutMarkdown`, `startMarkdown`
- Produces:
    - `llmsTxt(base: string): string`
    - `llmsFullTxt(base: string): string`

- [ ] **Step 1: Append failing tests** to `src/__tests__/agent-content.test.ts`:

```ts
import { llmsFullTxt } from '@/content/llms-full';
import { llmsTxt } from '@/content/llms';

describe('llmsTxt', () => {
    it('matches llms.txt shape with absolute .md and API links', () => {
        const md = llmsTxt('https://tokenmaxer.quest');
        expect(md).toMatch(/^# tokenmaxer\.quest/m);
        expect(md).toMatch(/^>/m);
        expect(md).toContain('## Docs');
        expect(md).toContain('## API');
        expect(md).toContain(
            '[Leaderboard](https://tokenmaxer.quest/index.md)',
        );
        expect(md).toContain('[About](https://tokenmaxer.quest/about.md)');
        expect(md).toContain(
            '[Get started](https://tokenmaxer.quest/start.md)',
        );
        expect(md).toContain('https://tokenmaxer.quest/api/leaderboard');
        expect(md).toContain('https://tokenmaxer.quest/api/u/:username');
        expect(md).toContain('## Optional');
    });
});

describe('llmsFullTxt', () => {
    it('inlines about + start and stays under 50KB', () => {
        const md = llmsFullTxt('https://tokenmaxer.quest');
        expect(md).toContain('# About tokenmaxer.quest');
        expect(md).toContain('# Get started');
        expect(md).toContain('/index.md');
        expect(md.length).toBeLessThan(50_000);
    });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement**

`src/content/llms.ts`:

```ts
export function llmsTxt(base: string): string {
    const b = base.replace(/\/$/, '');
    return `# tokenmaxer.quest

> Public token leaderboard for AI builders (Claude Code, Codex, opencode, pi, Cursor). Self-reported session usage; no prompts or PII.

Prefer the Markdown links below. Live rankings also available as JSON.

## Docs

- [Leaderboard](${b}/index.md): Top builders — default top 10 · last 7 days
- [About](${b}/about.md): What is tracked, privacy, honor system
- [Get started](${b}/start.md): Claim username + reporter setup (invite cookie required when gate is on)
- [Profile pattern](${b}/u/USERNAME.md): Replace USERNAME — per-builder totals and model breakdown

## API

- [Leaderboard JSON](${b}/api/leaderboard): \`?window=&metric=&source=&model=&limit=\`
- [Profile JSON](${b}/api/u/:username): Totals + breakdown
- [Register](${b}/api/register): \`POST {username}\` (invite session when gated)
- [Ingest](${b}/api/ingest): Bearer — live session upserts
- [History](${b}/api/history): Bearer — bulk backfill
- [Health](${b}/api/health): Service ping

## Optional

- [Full corpus](${b}/llms-full.txt): About + start guide inlined for one-shot context
`;
}
```

`src/content/llms-full.ts`: concatenate a short intro, `aboutMarkdown()`, `startMarkdown(base)`, API pointer blurb, leaderboard pointer. Separate sections with `\n\n---\n\n`.

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/llms.ts src/content/llms-full.ts src/__tests__/agent-content.test.ts
git commit -m "$(cat <<'EOF'
feat: add llms.txt and llms-full.txt content builders

EOF
)"
```

---

### Task 4: Home + profile Markdown renderers

**Files:**

- Create: `src/content/home.md.ts`
- Create: `src/content/profile.md.ts`
- Modify: `src/__tests__/agent-content.test.ts`

**Interfaces:**

- Consumes: `LeaderboardEntry`, `Profile` from `@/lib/aggregate`; `formatTokens`, `formatUsd`, `formatDate` from `@/lib/format`; `Source`, `TimeWindow` from `@/types`
- Produces:
    - `homeMarkdown(opts: { base: string; entries: LeaderboardEntry[]; window: TimeWindow; source?: Source; model?: string }): string`
    - `profileMarkdown(opts: { base: string; profile: Profile }): string`
    - `profileNotFoundMarkdown(username: string): string`

- [ ] **Step 1: Append failing tests** with a small fixture entry/profile (invent numbers). Assert:

    - Home title + default copy mentions top 10 / 7 days
    - Table header includes: Rank, Username, Sessions, Input, Output, Cache read, Cache write, Reasoning, Total, Est. cost
    - Fixture username appears; `formatTokens` / `formatUsd` values appear
    - When `window: '30d'` is passed, body mentions `30d` (or “30 days”)
    - Profile includes username, rank, totals, breakdown model row
    - `profileNotFoundMarkdown('nope')` mentions not found / nope

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement renderers**

Table helper (private in `home.md.ts`):

```ts
function row(cols: string[]): string {
    return `| ${cols.join(' | ')} |`;
}
```

Home: YAML-free Markdown. Filter line listing active `window` / `source` / `model`. Empty entries → table header + note “No entries yet.” Footer pointing to `${base}/api/leaderboard`.

Profile: H1 username; summary line; totals as a short list or 1-row table; `## By model` table with Source, Model, Sessions, token columns, cost. Footer links to `${base}/llms.txt` and `${base}/api/u/${username}`.

Use `SOURCE_LABELS` map locally (same strings as `src/pages/profile.tsx`).

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/home.md.ts src/content/profile.md.ts src/__tests__/agent-content.test.ts
git commit -m "$(cat <<'EOF'
feat: render leaderboard and profile as Markdown tables

EOF
)"
```

---

### Task 5: Agent pages Hono sub-app

**Files:**

- Create: `src/routes/agent-pages.ts`
- Create: `src/__tests__/agent-pages.test.ts`

**Interfaces:**

- Consumes: content modules, `agent-markdown` helpers, `getLeaderboard`, `getProfile`, `inviteSessionAllowed`, `getInviteCookie`, `parseWindow`, `parseSourceParam` from `@/routes/leaderboard`
- Produces: `export const agentPageRoutes` — Hono app with:
    - `GET /llms.txt`
    - `GET /llms-full.txt`
    - `GET /about.md`
    - `GET /start.md`
    - `GET /index.md`
    - `GET /u/:username.md`

Also export helpers used by `index.tsx`:

```ts
export function requestBaseUrl(env: Env, url: string): string;
// same logic as baseUrl in index — move or duplicate once; prefer exporting from a tiny shared place
```

Prefer moving `baseUrl` from `index.tsx` into `src/lib/base-url.ts` as `baseUrl(env, url)` and importing from both — do that in this task if it keeps `index` thin.

**Mock env for tests:**

```ts
function emptyDb(): D1Database {
    const empty = { results: [] as unknown[] };
    return {
        prepare() {
            return {
                bind() {
                    return this;
                },
                all: async () => empty,
                first: async () => null,
            };
        },
    } as unknown as D1Database;
}

function env(over: Partial<Env> = {}): Env {
    return {
        DB: emptyDb(),
        RATE_LIMIT: {} as KVNamespace,
        ENVIRONMENT: 'test',
        PUBLIC_BASE_URL: 'https://tokenmaxer.quest',
        TURNSTYLE_SECRET_KEY: '',
        ...over,
    };
}
```

- [ ] **Step 1: Write failing tests** in `src/__tests__/agent-pages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { inviteCookieToken } from '@/lib/invite';
import { agentPageRoutes } from '@/routes/agent-pages';
// env + emptyDb helpers as above

describe('agentPageRoutes', () => {
    it('serves llms.txt as text/plain', async () => {
        const res = await agentPageRoutes.request(
            'https://tokenmaxer.quest/llms.txt',
            {},
            env(),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toMatch(/text\/plain/);
        const body = await res.text();
        expect(body).toContain('# tokenmaxer.quest');
        expect(body).toContain('/index.md');
    });

    it('serves about.md as markdown', async () => {
        const res = await agentPageRoutes.request(
            'https://tokenmaxer.quest/about.md',
            {},
            env(),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toMatch(/text\/markdown/);
        expect(await res.text()).toContain('# About tokenmaxer.quest');
    });

    it('rejects start.md without invite when gate on', async () => {
        const res = await agentPageRoutes.request(
            'https://tokenmaxer.quest/start.md',
            {},
            env({ INVITE_KEY: 'secret' }),
        );
        expect(res.status).toBe(403);
        expect(await res.text()).toContain('Invite required');
    });

    it('allows start.md with valid invite cookie', async () => {
        const token = await inviteCookieToken('secret');
        const res = await agentPageRoutes.request(
            'https://tokenmaxer.quest/start.md',
            { headers: { Cookie: `tt_invite=${token}` } },
            env({ INVITE_KEY: 'secret' }),
        );
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('# Get started');
    });

    it('serves index.md with empty table', async () => {
        const res = await agentPageRoutes.request(
            'https://tokenmaxer.quest/index.md',
            {},
            env(),
        );
        expect(res.status).toBe(200);
        const body = await res.text();
        expect(body).toContain('| Rank |');
        expect(body).toMatch(/7d|7 days/i);
    });

    it('404s unknown profile.md', async () => {
        const res = await agentPageRoutes.request(
            'https://tokenmaxer.quest/u/nobody.md',
            {},
            env(),
        );
        expect(res.status).toBe(404);
        expect(await res.text()).toMatch(/not found/i);
    });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement `src/routes/agent-pages.ts`**

```ts
import { Hono } from 'hono';
import { aboutMarkdown } from '@/content/about.md';
import { homeMarkdown } from '@/content/home.md';
import { llmsFullTxt } from '@/content/llms-full';
import { llmsTxt } from '@/content/llms';
import { profileMarkdown, profileNotFoundMarkdown } from '@/content/profile.md';
import { startMarkdown } from '@/content/start.md';
import { getLeaderboard, getProfile } from '@/lib/aggregate';
import {
    INVITE_REQUIRED_MD,
    markdownBody,
    plainBody,
} from '@/lib/agent-markdown';
import { baseUrl } from '@/lib/base-url'; // after extracting
import { getInviteCookie, inviteSessionAllowed } from '@/lib/invite';
import { parseSourceParam, parseWindow } from '@/routes/leaderboard';
import type { Env } from '@/types';

export const agentPageRoutes = new Hono<{ Bindings: Env }>();

agentPageRoutes.get('/llms.txt', (c) =>
    plainBody(llmsTxt(baseUrl(c.env, c.req.url))),
);
// … likewise llms-full, about.md

agentPageRoutes.get('/start.md', async (c) => {
    const invited = await inviteSessionAllowed(
        c.env.INVITE_KEY,
        getInviteCookie(c),
    );
    if (!invited) return markdownBody(INVITE_REQUIRED_MD, { status: 403 });
    return markdownBody(startMarkdown(baseUrl(c.env, c.req.url)));
});

agentPageRoutes.get('/index.md', async (c) => {
    const window = parseWindow(c.req.query('window'));
    const source = parseSourceParam(c.req.query('source'));
    const modelRaw = c.req.query('model');
    const model = modelRaw && modelRaw.length > 0 ? modelRaw : undefined;
    const entries = await getLeaderboard(
        c.env.DB,
        { window, metric: 'total', source, model, limit: 10 },
        Date.now(),
    );
    return markdownBody(
        homeMarkdown({
            base: baseUrl(c.env, c.req.url),
            entries,
            window,
            source,
            model,
        }),
    );
});

agentPageRoutes.get('/u/:username.md', async (c) => {
    const username = c.req.param('username');
    const profile = await getProfile(c.env.DB, username);
    if (!profile) {
        return markdownBody(profileNotFoundMarkdown(username), { status: 404 });
    }
    return markdownBody(
        profileMarkdown({
            base: baseUrl(c.env, c.req.url),
            profile,
        }),
    );
});
```

Extract `baseUrl` to `src/lib/base-url.ts` and update `index.tsx` import.

**Route order note:** Hono matches `/u/:username.md` as a path with literal `.md` in the param if written wrong. Use path `'/u/:username.md'` — in Hono 4 this treats `.md` as literal suffix when the pattern includes it. Verify with the 404 test; if `:username` swallows `.md`, register as:

```ts
agentPageRoutes.get('/u/:username{.+\\.md}', …)
// or strip: param endsWith .md
```

Prefer an explicit check:

```ts
agentPageRoutes.get('/u/:username', async (c) => {
    const raw = c.req.param('username');
    if (!raw.endsWith('.md')) return c.notFound();
    const username = raw.slice(0, -3);
    …
});
```

Only if the literal `.md` pattern fails — try literal first in implementation.

- [ ] **Step 4: Run** `pnpm vitest run src/__tests__/agent-pages.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/base-url.ts src/routes/agent-pages.ts src/__tests__/agent-pages.test.ts src/index.tsx
git commit -m "$(cat <<'EOF'
feat: add agent Markdown page routes

EOF
)"
```

---

### Task 6: Mount routes + negotiate HTML pages

**Files:**

- Modify: `src/index.tsx`
- Modify: `src/__tests__/agent-pages.test.ts` (or add negotiation cases if testing via exported helper only — prefer a thin export)

**Interfaces:**

- Consumes: `isBrowserRequest`, `agentPageRoutes`, content renderers, existing page components
- Behavior:
    - `app.route('/', agentPageRoutes)` early (after www redirect / before or after API — must not shadow `/api`)
    - For `GET /`, `/about`, `/start`, `/u/:username`: if `!isBrowserRequest(c.req.raw)` then return the same Markdown as the `.md` handlers (shared internal functions — either call `agentPageRoutes.fetch` with rewritten URL, or extract `serveHomeMarkdown(c)` helpers in `agent-pages.ts` and use from both)

**Recommended wiring to avoid duplication:** export named handlers from `agent-pages.ts`:

```ts
export async function serveHomeMarkdown(
    c: Context<{ Bindings: Env }>,
): Promise<Response>;
export async function serveAboutMarkdown(
    c: Context<{ Bindings: Env }>,
): Promise<Response>;
export async function serveStartMarkdown(
    c: Context<{ Bindings: Env }>,
): Promise<Response>;
export async function serveProfileMarkdown(
    c: Context<{ Bindings: Env }>,
): Promise<Response>;
```

`.md` routes and HTML-route branches both call these.

Also add discovery headers on successful **HTML** responses for those pages (optional but in spec). Helper:

```ts
export function applyAgentDiscoveryHeaders(res: Response): Response {
    const headers = new Headers(res.headers);
    headers.set('Link', '</llms.txt>; rel="describedby"');
    headers.set('X-Llms-Txt', '/llms.txt');
    // do not overwrite existing Vary incorrectly — append Accept, Sec-Fetch-Mode if missing
    return new Response(res.body, { status: res.status, headers });
}
```

Apply after `c.html(...)` by wrapping, or set headers on `c` before return if Hono allows `c.header(...)`.

Prefer `c.header('Link', '...')` / `c.header('X-Llms-Txt', '/llms.txt')` on HTML branches before `return c.html(...)`.

- [ ] **Step 1: Write failing test** for negotiation via exported `isBrowserRequest` already covered; add one sub-app-level test is enough. Add test that documents HTML branch by exporting a tiny `shouldServeMarkdown(req: Request): boolean` = `!isBrowserRequest(req)` — already covered in Task 1.

    Add to `agent-pages.test.ts`:

```ts
it('serveHomeMarkdown returns markdown for empty db', async () => {
    const { serveHomeMarkdown } = await import('@/routes/agent-pages');
    // Build a minimal mock Context OR hit /index.md (already tested).
});
```

Skip fragile Context mocks — Task 5 `/index.md` covers the body. This task’s tests:

```ts
import { isBrowserRequest } from '@/lib/agent-markdown';

it('negotiation: browser Accept keeps HTML path responsibility', () => {
    expect(
        isBrowserRequest(
            new Request('https://x/', {
                headers: { Accept: 'text/html' },
            }),
        ),
    ).toBe(true);
});
```

(Already in Task 1 — no new test required if Task 1 passed. **Manual verification steps below are required.**)

- [ ] **Step 2: Implement index changes**

```ts
import { isBrowserRequest } from '@/lib/agent-markdown';
import { baseUrl } from '@/lib/base-url';
import {
    agentPageRoutes,
    serveAboutMarkdown,
    serveHomeMarkdown,
    serveProfileMarkdown,
    serveStartMarkdown,
} from '@/routes/agent-pages';

app.route('/', agentPageRoutes);

app.get('/', async (c) => {
    if (!isBrowserRequest(c.req.raw)) return serveHomeMarkdown(c);
    c.header('Link', '</llms.txt>; rel="describedby"');
    c.header('X-Llms-Txt', '/llms.txt');
    // … existing HTML …
});

app.get('/about', (c) => {
    if (!isBrowserRequest(c.req.raw)) return serveAboutMarkdown(c);
    c.header('Link', '</llms.txt>; rel="describedby"');
    c.header('X-Llms-Txt', '/llms.txt');
    return c.html(<About base={baseUrl(c.env, c.req.url)} />);
});

// same pattern for /start and /u/:username
// /start markdown branch must run invite check inside serveStartMarkdown
```

For `/u/:username` HTML 404: if markdown path, use `serveProfileMarkdown` (returns 404 md). If browser, keep existing HTML 404.

- [ ] **Step 3: Run full unit suite**

```bash
pnpm vitest run src/__tests__/agent-markdown.test.ts src/__tests__/agent-content.test.ts src/__tests__/agent-pages.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Manual verification** with `pnpm dev` in another terminal:

```bash
# Markdown (curl)
curl -sS http://127.0.0.1:8787/ | head
curl -sS http://127.0.0.1:8787/about.md | head
curl -sS -H 'Accept: text/html' http://127.0.0.1:8787/about | head  # should be HTML
curl -sS http://127.0.0.1:8787/llms.txt | head
curl -sS -D- -o /dev/null http://127.0.0.1:8787/about.md | grep -i vary
```

Expected: curl home starts with `#`; HTML Accept returns `<!DOCTYPE` or `<html`; `Vary` includes `Accept`.

- [ ] **Step 5: Commit**

```bash
git add src/index.tsx src/routes/agent-pages.ts src/lib/base-url.ts
git commit -m "$(cat <<'EOF'
feat: negotiate Markdown for non-browser page requests

EOF
)"
```

---

### Task 7: README note + final check

**Files:**

- Modify: `README.md` — short “Agent / Markdown” subsection under API or How it works

- [ ] **Step 1: Add README blurb**

```markdown
## Agent-readable pages

Non-browser clients (e.g. \`curl\`) get Markdown by default on \`/\`, \`/about\`,
\`/start\`, and \`/u/:username\`. Browsers still get HTML. Explicit twins:

- \`/llms.txt\`, \`/llms-full.txt\`
- \`/index.md\`, \`/about.md\`, \`/start.md\`, \`/u/:username.md\`

\`/start.md\` requires the invite session cookie when \`INVITE_KEY\` is set.
```

- [ ] **Step 2: Run** `pnpm test && pnpm typecheck && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: document agent Markdown endpoints

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement                                         | Task    |
| -------------------------------------------------------- | ------- |
| `/llms.txt` + `/llms-full.txt`                           | 3, 5    |
| `.md` twins for `/`, about, start, profiles              | 2, 4, 5 |
| Browser heuristic (Accept text/html \|\| Sec-Fetch-Mode) | 1, 6    |
| curl / `*/*` → Markdown                                  | 1, 6    |
| `Vary` + Link / X-Llms-Txt                               | 1, 6    |
| Home top 10 / 7d all columns                             | 4, 5    |
| Profile MD + 404 text                                    | 4, 5    |
| Start invite 403                                         | 2, 5    |
| JSON API linked from llms.txt                            | 3       |
| Origin-only (no CF edge feature)                         | all     |
| Tests for negotiation + content                          | 1–5     |
| README                                                   | 7       |
