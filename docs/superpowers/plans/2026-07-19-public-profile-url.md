# Public Profile URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Bearer-token holders set or clear an optional `https:` external profile URL via `POST /api/profile` and `tokenmaxer set-profile-url`, and show it on public profile surfaces.

**Architecture:** Add nullable `users.profile_url`, validate with a shared `validateProfileUrl` helper, expose a small Hono write route next to register/token-rotate, map `url` through `getProfile` into HTML/Markdown/JSON, and add a CLI command on the existing zero-dep reporter that POSTs the same API (with `--dry-run` / `--clear`).

**Tech Stack:** Cloudflare Workers, Hono, D1/Drizzle SQL migrations, Vitest, `reporter/tokentally.mjs` (`tokenmaxer`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-19-public-profile-url-design.md`.
- API field name is `url` (JSON); DB column is `profile_url`.
- Validation: `https:` only, max 2048 chars, `""`/`null` clears; reject credentials and non-https schemes.
- Write auth: Bearer token only; rate limit `rl:profile:${user.id}` at 20/hour.
- Display: profile HTML + Markdown + `GET /api/u/:username` only — not leaderboard.
- CLI command name: `tokenmaxer set-profile-url` (not `set-url`).
- No username rename, no browser settings form.
- Tests: `pnpm vitest run <file>`. Lint/format: `pnpm lint` / `pnpm fmt`. Typecheck: `pnpm typecheck`.
- Commit messages: concise `feat:` / `test:` / `docs:` style.

## File map

| File                                  | Responsibility                                        |
| ------------------------------------- | ----------------------------------------------------- |
| `drizzle/0002_profile_url.sql`        | Add `users.profile_url`                               |
| `src/lib/validate.ts`                 | `validateProfileUrl`                                  |
| `src/lib/aggregate.ts`                | `Profile.url`; SELECT + map in `getProfile`           |
| `src/routes/profile.ts`               | `POST /api/profile`                                   |
| `src/index.tsx`                       | Mount profile routes                                  |
| `src/pages/profile.tsx`               | HTML link when `url` set                              |
| `src/content/profile.md.ts`           | Markdown link when `url` set                          |
| `src/content/about.md.ts`             | Opt-in public link note                               |
| `src/pages/about.tsx`                 | Same privacy note if duplicated in HTML               |
| `src/content/llms.ts`                 | List `POST /api/profile`                              |
| `reporter/tokentally.mjs`             | `set-profile-url` command + exported arg/body helpers |
| `reporter/README.md`                  | Document CLI                                          |
| `README.md`                           | API table + optional CLI one-liner                    |
| `src/__tests__/validate.test.ts`      | URL validation                                        |
| `src/__tests__/profile-route.test.ts` | Route auth/set/clear/invalid                          |
| `src/__tests__/agent-content.test.ts` | Profile MD + about + llms mentions                    |
| `src/__tests__/reporter.test.ts`      | CLI arg/body helpers                                  |

---

### Task 1: `validateProfileUrl`

**Files:**

- Modify: `src/lib/validate.ts`
- Test: `src/__tests__/validate.test.ts`

**Interfaces:**

- Produces: `validateProfileUrl(raw: unknown): Result<string | null>`
    - `ok: true, value: null` → clear
    - `ok: true, value: string` → normalized `https:` URL (`URL.href`)
    - `ok: false, error: string` → reject

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/validate.test.ts`:

```ts
import { validateProfileUrl } from '@/lib/validate';

describe('validateProfileUrl', () => {
    it('accepts https URLs and returns href', () => {
        expect(validateProfileUrl('https://example.com/me')).toEqual({
            ok: true,
            value: 'https://example.com/me',
        });
    });

    it('trims whitespace', () => {
        expect(validateProfileUrl('  https://example.com/x  ')).toEqual({
            ok: true,
            value: 'https://example.com/x',
        });
    });

    it('clears on null or empty string', () => {
        expect(validateProfileUrl(null)).toEqual({ ok: true, value: null });
        expect(validateProfileUrl('')).toEqual({ ok: true, value: null });
        expect(validateProfileUrl('   ')).toEqual({ ok: true, value: null });
    });

    it('rejects http, javascript, relative, and non-strings', () => {
        expect(validateProfileUrl('http://example.com').ok).toBe(false);
        expect(validateProfileUrl('javascript:alert(1)').ok).toBe(false);
        expect(validateProfileUrl('/relative').ok).toBe(false);
        expect(validateProfileUrl('example.com').ok).toBe(false);
        expect(validateProfileUrl(42).ok).toBe(false);
    });

    it('rejects URLs with credentials', () => {
        expect(validateProfileUrl('https://user:pass@example.com').ok).toBe(
            false,
        );
    });

    it('rejects overlong URLs', () => {
        const long = `https://example.com/${'a'.repeat(2048)}`;
        expect(validateProfileUrl(long).ok).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/__tests__/validate.test.ts -t validateProfileUrl`

Expected: FAIL — `validateProfileUrl` is not exported.

- [ ] **Step 3: Implement `validateProfileUrl`**

In `src/lib/validate.ts`, add:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/__tests__/validate.test.ts -t validateProfileUrl`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/validate.ts src/__tests__/validate.test.ts
git commit -m "$(cat <<'EOF'
feat: add validateProfileUrl for https profile links

EOF
)"
```

---

### Task 2: Migration + `Profile.url` in `getProfile`

**Files:**

- Create: `drizzle/0002_profile_url.sql`
- Modify: `src/lib/aggregate.ts` (`Profile` interface + `getProfile` SELECT)

**Interfaces:**

- Consumes: none from Task 1
- Produces: `Profile.url: string | null`; `getProfile` returns it from `users.profile_url`

- [ ] **Step 1: Add migration**

Create `drizzle/0002_profile_url.sql`:

```sql
-- Optional external public profile URL (https only; validated in app).
ALTER TABLE users ADD COLUMN profile_url TEXT;
```

- [ ] **Step 2: Extend `Profile` and `getProfile`**

In `src/lib/aggregate.ts`, update the interface:

```ts
export interface Profile extends Totals {
    username: string;
    created_at: number;
    rank: number;
    sessions: number;
    grand_total: number;
    breakdown: ModelBreakdown[];
    url: string | null;
}
```

Change the user SELECT in `getProfile` to:

```ts
const user = await db
    .prepare(
        'SELECT id, username, created_at, profile_url FROM users WHERE username_lower = ?',
    )
    .bind(username.toLowerCase())
    .first<{
        id: string;
        username: string;
        created_at: number;
        profile_url: string | null;
    }>();
```

Include in the returned object:

```ts
return {
    username: user.username,
    created_at: user.created_at,
    rank: (rankRes?.ahead ?? 0) + 1,
    sessions,
    grand_total: myTotal,
    breakdown,
    url: user.profile_url ?? null,
    ...totals,
};
```

- [ ] **Step 3: Fix TypeScript breakages in fixtures**

Any `Profile` object literals in tests (e.g. `fixtureProfile` in `src/__tests__/agent-content.test.ts`) must add `url: null` (or a sample URL). Update them now so `pnpm typecheck` stays green.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add drizzle/0002_profile_url.sql src/lib/aggregate.ts src/__tests__/agent-content.test.ts
git commit -m "$(cat <<'EOF'
feat: store and return optional profile_url on users

EOF
)"
```

---

### Task 3: `POST /api/profile` route

**Files:**

- Create: `src/routes/profile.ts`
- Create: `src/__tests__/profile-route.test.ts`
- Modify: `src/index.tsx` (mount route)
- Modify: `README.md` (API table row)

**Interfaces:**

- Consumes: `authenticate`, `rateLimit`, `validateProfileUrl`
- Produces: Hono sub-app `profileRoutes` with `POST /profile` → `{ username, url }`

- [ ] **Step 1: Write failing route tests**

Create `src/__tests__/profile-route.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hashToken } from '@/lib/auth';
import app from '@/index';
import type { Env } from '@/types';

const TOKEN = 'tt_test_profile_token';
const USER = {
    id: 'u1',
    username: 'alice',
    username_lower: 'alice',
    token_hash: '', // filled in beforeAll
    created_at: 1,
    profile_url: null as string | null,
};

function kv(): KVNamespace {
    const store = new Map<string, string>();
    return {
        get: async (key: string) => store.get(key) ?? null,
        put: async (key: string, value: string) => {
            store.set(key, value);
        },
        delete: async (key: string) => {
            store.delete(key);
        },
        list: async () => ({
            keys: [],
            list_complete: true,
            cacheStatus: null,
        }),
        getWithMetadata: async () => ({ value: null, metadata: null }),
    } as unknown as KVNamespace;
}

function db(): D1Database {
    return {
        prepare(sql: string) {
            const self = {
                binds: [] as unknown[],
                bind(...args: unknown[]) {
                    self.binds = args;
                    return self;
                },
                async first<T>() {
                    if (sql.includes('token_hash')) {
                        const hash = self.binds[0];
                        if (hash === USER.token_hash) {
                            return {
                                id: USER.id,
                                username: USER.username,
                                username_lower: USER.username_lower,
                                token_hash: USER.token_hash,
                                created_at: USER.created_at,
                            } as T;
                        }
                        return null;
                    }
                    return null;
                },
                async run() {
                    if (sql.includes('UPDATE users SET profile_url')) {
                        USER.profile_url = self.binds[0] as string | null;
                    }
                    return { success: true, meta: {} };
                },
                async all() {
                    return { results: [] };
                },
            };
            return self;
        },
    } as unknown as D1Database;
}

function env(): Env {
    return {
        DB: db(),
        RATE_LIMIT: kv(),
        ENVIRONMENT: 'test',
        PUBLIC_BASE_URL: 'https://tokenmaxer.quest',
        TURNSTYLE_SECRET_KEY: '',
    };
}

describe('POST /api/profile', () => {
    it('rejects missing auth', async () => {
        const res = await app.request(
            'https://tokenmaxer.quest/api/profile',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: 'https://example.com' }),
            },
            env(),
        );
        expect(res.status).toBe(401);
    });

    it('sets and clears a profile url', async () => {
        USER.token_hash = await hashToken(TOKEN);
        USER.profile_url = null;

        const setRes = await app.request(
            'https://tokenmaxer.quest/api/profile',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${TOKEN}`,
                },
                body: JSON.stringify({ url: 'https://example.com/me' }),
            },
            env(),
        );
        expect(setRes.status).toBe(200);
        expect(await setRes.json()).toEqual({
            username: 'alice',
            url: 'https://example.com/me',
        });
        expect(USER.profile_url).toBe('https://example.com/me');

        const clearRes = await app.request(
            'https://tokenmaxer.quest/api/profile',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${TOKEN}`,
                },
                body: JSON.stringify({ url: null }),
            },
            env(),
        );
        expect(clearRes.status).toBe(200);
        expect(await clearRes.json()).toEqual({
            username: 'alice',
            url: null,
        });
        expect(USER.profile_url).toBeNull();
    });

    it('rejects http urls', async () => {
        USER.token_hash = await hashToken(TOKEN);
        const res = await app.request(
            'https://tokenmaxer.quest/api/profile',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${TOKEN}`,
                },
                body: JSON.stringify({ url: 'http://example.com' }),
            },
            env(),
        );
        expect(res.status).toBe(400);
    });
});
```

Adjust the mock `prepare` SQL matching if the real UPDATE string differs slightly — keep the test aligned with the implementation in Step 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/__tests__/profile-route.test.ts`

Expected: FAIL — `/api/profile` not found or 404.

- [ ] **Step 3: Implement route and mount it**

Create `src/routes/profile.ts`:

```ts
import { Hono } from 'hono';
import { authenticate } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { validateProfileUrl } from '@/lib/validate';
import type { Env } from '@/types';

const app = new Hono<{ Bindings: Env }>();

// POST /api/profile  (Bearer)  { url: string | null } -> { username, url }
app.post('/profile', async (c) => {
    const user = await authenticate(c.env.DB, c.req.header('Authorization'));
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    const limit = await rateLimit(
        c.env.RATE_LIMIT,
        `rl:profile:${user.id}`,
        20,
        3600,
    );
    if (!limit.allowed) {
        return c.json({ error: 'rate limit exceeded' }, 429);
    }

    const body = await c.req.json<unknown>().catch(() => null);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return c.json({ error: 'body must be an object' }, 400);
    }
    const rawUrl = (body as { url?: unknown }).url;
    // Missing `url` key is invalid; only null/"" clear.
    if (!('url' in body)) {
        return c.json({ error: 'url is required' }, 400);
    }

    const parsed = validateProfileUrl(rawUrl);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    await c.env.DB.prepare('UPDATE users SET profile_url = ? WHERE id = ?')
        .bind(parsed.value, user.id)
        .run();

    return c.json({ username: user.username, url: parsed.value });
});

export { app as profileRoutes };
```

In `src/index.tsx`, import and mount next to other API routes:

```ts
import { profileRoutes } from '@/routes/profile';
// ...
app.route('/api', profileRoutes);
```

- [ ] **Step 4: Run route tests**

Run: `pnpm vitest run src/__tests__/profile-route.test.ts`

Expected: PASS

- [ ] **Step 5: Update root README API table**

Add a row under the API table in `README.md`:

```md
| POST | `/api/profile` | Bearer | set/clear `{url}` (https public profile link) |
```

- [ ] **Step 6: Commit**

```bash
git add src/routes/profile.ts src/index.tsx src/__tests__/profile-route.test.ts README.md
git commit -m "$(cat <<'EOF'
feat: add Bearer POST /api/profile for public URL

EOF
)"
```

---

### Task 4: Show URL on profile HTML, Markdown, about, llms

**Files:**

- Modify: `src/pages/profile.tsx`
- Modify: `src/content/profile.md.ts`
- Modify: `src/content/about.md.ts`
- Modify: `src/pages/about.tsx` (if it duplicates privacy copy; keep HTML/MD aligned)
- Modify: `src/content/llms.ts`
- Modify: `src/__tests__/agent-content.test.ts`

**Interfaces:**

- Consumes: `Profile.url: string | null`
- Produces: visible outbound link when set; docs mention opt-in link + API

- [ ] **Step 1: Write/extend failing content tests**

In `src/__tests__/agent-content.test.ts`:

1. Ensure `fixtureProfile` has `url: null` (from Task 2) and add a case:

```ts
it('includes a markdown link when profile.url is set', () => {
    const md = profileMarkdown({
        base: 'https://tokenmaxer.quest',
        profile: { ...fixtureProfile, url: 'https://example.com/bob' },
    });
    expect(md).toContain('[https://example.com/bob](https://example.com/bob)');
});
```

2. In `aboutMarkdown` tests, expect a mention of optional public profile link / `set-profile-url` or `/api/profile` (pick one stable phrase, e.g. `/api/profile` or `profile URL`).

3. In `llmsTxt` tests, expect `/api/profile` to appear under API.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/__tests__/agent-content.test.ts -t "profileMarkdown|aboutMarkdown|llmsTxt"`

Expected: FAIL on new assertions.

- [ ] **Step 3: Render link in Markdown profile**

In `src/content/profile.md.ts`, after the rank line, when `p.url` is set:

```ts
const linkLine = p.url ? `\n\nProfile: [${p.url}](${p.url})` : '';

return `# ${p.username}

Rank #${p.rank} · joined ${formatDate(p.created_at)} · ${p.sessions} sessions tracked${linkLine}

${summary}
...
`;
```

- [ ] **Step 4: Render link in HTML profile**

In `src/pages/profile.tsx`, under the hero subtitle (still inside the hero section), when `p.url` is set:

```tsx
{
    p.url ? (
        <p class="reveal reveal-delay mb-0 mt-3 text-[16px]">
            <a
                href={p.url}
                rel="noopener noreferrer"
                target="_blank"
            >
                {p.url}
            </a>
        </p>
    ) : null;
}
```

Use existing link styles from the design system (accent blue hyperlinks) — do not introduce a card.

- [ ] **Step 5: Docs copy — about + llms**

In `src/content/about.md.ts` Accounts & privacy section, append a sentence such as:

> You may optionally publish an external profile URL (`https:` only) via `POST /api/profile` or `tokenmaxer set-profile-url`; it appears on your public profile. Clearing it removes the link. Everything else remains non-PII by default.

Mirror the same idea in `src/pages/about.tsx` if that page has its own prose (do not leave HTML/MD divergent).

In `src/content/llms.ts` API section, add:

```md
- [Update profile URL](${b}/api/profile): \`POST {url}\` (Bearer) — set or clear https link
```

- [ ] **Step 6: Run content tests**

Run: `pnpm vitest run src/__tests__/agent-content.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/pages/profile.tsx src/content/profile.md.ts src/content/about.md.ts src/pages/about.tsx src/content/llms.ts src/__tests__/agent-content.test.ts
git commit -m "$(cat <<'EOF'
feat: show optional profile URL on public profiles

EOF
)"
```

---

### Task 5: CLI `tokenmaxer set-profile-url`

**Files:**

- Modify: `reporter/tokentally.mjs`
- Modify: `reporter/README.md`
- Modify: `README.md` (short onboarding one-liner near tokenmaxer usage)
- Modify: `src/__tests__/reporter.test.ts`

**Interfaces:**

- Produces (exported for tests):
    - `parseSetProfileUrlArgs(argv: string[]): { clear: true } | { clear: false; url: string }`
        - throws `Error` with usage message on bad args
    - `buildProfileUrlBody(parsed): { url: string | null }`

- CLI:
    - `tokenmaxer set-profile-url <https-url>`
    - `tokenmaxer set-profile-url --clear`
    - honors global `--dry-run`
    - exits `1` on failure (unlike hooks, which stay exit `0`)

- [ ] **Step 1: Write failing reporter tests**

Append to `src/__tests__/reporter.test.ts`:

```ts
import {
    parseSetProfileUrlArgs,
    buildProfileUrlBody,
} from '../../reporter/tokentally.mjs';

describe('set-profile-url helpers', () => {
    it('parses a url argument', () => {
        expect(parseSetProfileUrlArgs(['https://example.com/me'])).toEqual({
            clear: false,
            url: 'https://example.com/me',
        });
    });

    it('parses --clear', () => {
        expect(parseSetProfileUrlArgs(['--clear'])).toEqual({ clear: true });
    });

    it('rejects missing args', () => {
        expect(() => parseSetProfileUrlArgs([])).toThrow(/set-profile-url/u);
    });

    it('builds JSON bodies', () => {
        expect(
            buildProfileUrlBody({
                clear: false,
                url: 'https://example.com/me',
            }),
        ).toEqual({ url: 'https://example.com/me' });
        expect(buildProfileUrlBody({ clear: true })).toEqual({ url: null });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/__tests__/reporter.test.ts -t "set-profile-url"`

Expected: FAIL — exports missing.

- [ ] **Step 3: Implement helpers + command in `reporter/tokentally.mjs`**

Near other exports / before `main`, add:

```js
export function parseSetProfileUrlArgs(argv) {
    const args = argv.filter((a) => a !== '--dry-run');
    if (args.length === 1 && args[0] === '--clear') return { clear: true };
    if (
        args.length === 1 &&
        typeof args[0] === 'string' &&
        args[0].length > 0
    ) {
        return { clear: false, url: args[0] };
    }
    throw new Error(
        'usage: tokenmaxer set-profile-url <https-url> | tokenmaxer set-profile-url --clear [--dry-run]',
    );
}

export function buildProfileUrlBody(parsed) {
    return { url: parsed.clear ? null : parsed.url };
}

async function setProfileUrl(cfg, argv) {
    const parsed = parseSetProfileUrlArgs(argv);
    const body = buildProfileUrlBody(parsed);
    const endpoint = `${cfg.apiBase}/api/profile`;
    if (DRY_RUN) {
        process.stdout.write(
            `${JSON.stringify({ method: 'POST', url: endpoint, body }, null, 2)}\n`,
        );
        return;
    }
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.token}`,
        },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error ?? `profile update failed (${res.status})`);
    }
    if (data.url) {
        process.stdout.write(`profile url: ${data.url}\n`);
    } else {
        process.stdout.write('profile url: cleared\n');
    }
}
```

In `main()` switch, add:

```js
case 'set-profile-url': {
    try {
        await setProfileUrl(cfg, process.argv.slice(3));
    } catch (err) {
        process.stderr.write(`tokentally: ${err?.message ?? err}\n`);
        process.exit(1);
    }
    break;
}
```

Update the header Usage comment and the `default:` usage string to include `set-profile-url <https-url>|--clear`.

- [ ] **Step 4: Run reporter tests**

Run: `pnpm vitest run src/__tests__/reporter.test.ts -t "set-profile-url"`

Expected: PASS

- [ ] **Step 5: Update reporter + root docs**

In `reporter/README.md` Usage block, add:

```
tokenmaxer set-profile-url <https-url> [--dry-run]
tokenmaxer set-profile-url --clear [--dry-run]
```

In root `README.md` onboarding / usage area, add a short note after the backfill examples:

```sh
tokenmaxer set-profile-url https://github.com/YOU   # optional public link on /u/YOU
tokenmaxer set-profile-url --clear
```

- [ ] **Step 6: Full check**

Run: `pnpm vitest run src/__tests__/validate.test.ts src/__tests__/profile-route.test.ts src/__tests__/agent-content.test.ts src/__tests__/reporter.test.ts && pnpm typecheck`

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add reporter/tokentally.mjs reporter/README.md README.md src/__tests__/reporter.test.ts
git commit -m "$(cat <<'EOF'
feat: add tokenmaxer set-profile-url CLI command

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement                                               | Task                        |
| -------------------------------------------------------------- | --------------------------- |
| `users.profile_url` migration                                  | 2                           |
| `validateProfileUrl` https-only / clear / length / credentials | 1                           |
| `POST /api/profile` Bearer + rate limit 20/h                   | 3                           |
| JSON `{ username, url }`                                       | 3                           |
| `GET /api/u/:username` includes `url`                          | 2 (via `getProfile`)        |
| HTML profile link                                              | 4                           |
| Markdown profile link                                          | 4                           |
| Not on leaderboard                                             | (no task — leave unchanged) |
| `tokenmaxer set-profile-url` / `--clear` / `--dry-run`         | 5                           |
| Exit non-zero on CLI failure                                   | 5                           |
| README / reporter README / about / llms docs                   | 3, 4, 5                     |
| Unit + route + reporter tests                                  | 1, 3, 4, 5                  |

## Out of scope (do not implement)

- Username rename
- Browser settings UI
- Leaderboard link column
- `http:` URLs
- Multiple social links / bio
