# Register-time Profile URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept an optional external `url` on invite-gated `POST /api/register` and collect it on the `/start` claim form.

**Architecture:** Reuse `validateProfileUrl` and the existing `users.profile_url` column. Register validates optional `url`, binds it on INSERT. Browser form and `start.md` document the same optional field. Later edits stay on `POST /api/profile` / CLI.

**Tech Stack:** Hono, Cloudflare Workers/D1, Vitest, JSX start page

## Global Constraints

- Profile URL remains optional at claim
- Invite cookie + Turnstile gates unchanged
- https-only validation via existing `validateProfileUrl`
- No schema migration
- No commit unless the user asks (override plan commit steps)

---

## File map

| File                                   | Role                                                |
| -------------------------------------- | --------------------------------------------------- |
| `src/routes/register.ts`               | Parse/validate optional `url`; INSERT `profile_url` |
| `src/pages/start.tsx`                  | Optional input + include `url` in register JSON     |
| `src/content/start.md.ts`              | Document optional `url` on register                 |
| `src/__tests__/register-route.test.ts` | New: register with/without/invalid url              |
| `src/__tests__/invite-session.test.ts` | Assert invited form has profile URL input           |
| `src/__tests__/agent-content.test.ts`  | Assert start.md mentions optional url               |

---

### Task 1: Register API accepts optional `url`

**Files:**

- Create: `src/__tests__/register-route.test.ts`
- Modify: `src/routes/register.ts`

**Interfaces:**

- Consumes: `validateProfileUrl(raw) -> Result<string | null>`
- Produces: `POST /api/register` body may include `url?; INSERT` binds `profile_url`

- [x] **Step 1: Write failing register-route tests**

Create `src/__tests__/register-route.test.ts` that:

- Stubs KV via `@/__tests__/helpers/kv`
- Mocks D1 to capture INSERT binds and reject duplicate usernames
- Stubs `globalThis.fetch` for Turnstile `siteverify` → `{ success: true }`
- Sets `INVITE_KEY` unset (gate off) OR sets invite cookie via `inviteCookieToken` when testing gate
- Prefer `INVITE_KEY` unset so invite is open; still send a dummy `turnstileToken`

Tests:

1. Valid `url` → 201; INSERT includes normalized profile_url
2. No `url` → 201; profile_url null/undefined in binds
3. Invalid `url` (`http://…`) → 400; no successful insert
4. When `INVITE_KEY` set and no cookie → 403 `invite required`

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/__tests__/register-route.test.ts
```

- [ ] **Step 3: Implement register.ts**

- Import `validateProfileUrl`
- Extend body type with `url?: unknown`
- After username validation, `const urlCheck = validateProfileUrl(body.url === undefined ? null : body.url)`; if `body.url` is undefined, treat as null (optional). Spec: omit / "" / null → null. So: if `'url' in body` validate that value; else use null. Simpler: always `validateProfileUrl(body.url ?? null)` — undefined becomes null via `?? null`, and validateProfileUrl(null) → null.
- Extend INSERT to include `profile_url` column and bind `urlCheck.value`

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/__tests__/register-route.test.ts
```

---

### Task 2: `/start` claim form optional Profile URL field

**Files:**

- Modify: `src/pages/start.tsx`
- Modify: `src/__tests__/invite-session.test.ts`

- [ ] **Step 1: Extend invite-session test**

In the existing unlock test that checks `id="username"`, also expect `id="profile-url"` (or chosen id) in invited HTML.

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/__tests__/invite-session.test.ts
```

- [ ] **Step 3: Update start.tsx**

- Add optional label + `Input` with `id="profile-url"`, type url, placeholder `https://github.com/you`, not required
- In submit handler: read value, trim; include `url` in JSON only when non-empty
- Optional one-line hero/sub copy mentioning optional public link

- [ ] **Step 4: Run invite-session tests — expect PASS**

```bash
npx vitest run src/__tests__/invite-session.test.ts
```

---

### Task 3: Document optional `url` in start.md

**Files:**

- Modify: `src/content/start.md.ts`
- Modify: `src/__tests__/agent-content.test.ts`

- [ ] **Step 1: Assert start.md includes optional url**

In `agent-content.test.ts` startMarkdown test, add:

```ts
expect(md).toContain('"url"');
expect(md).toContain('set-profile-url');
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/__tests__/agent-content.test.ts
```

- [ ] **Step 3: Update start.md.ts claim example**

```json
{
    "username": "yourname",
    "turnstileToken": "…",
    "url": "https://example.com/me"
}
```

Note that `url` is optional and can be set later with `tokenmaxer set-profile-url`.

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/__tests__/agent-content.test.ts
```

---

### Task 4: Full verification

- [ ] **Step 1: Run focused + related suites**

```bash
npx vitest run src/__tests__/register-route.test.ts src/__tests__/invite-session.test.ts src/__tests__/agent-content.test.ts src/__tests__/profile-route.test.ts src/__tests__/validate.test.ts
```

Expected: all pass

- [ ] **Step 2: Done — report summary; do not commit unless asked**
