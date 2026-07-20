# Register-time Profile URL — Design

Date: 2026-07-20  
Status: approved for planning  
Stack: Hono on Cloudflare Workers; invite-gated claim at `/start` + `POST /api/register`

## Goal

Let invitees optionally set their **external** public profile URL when claiming a username. Same validation and storage as today’s `POST /api/profile` / `tokenmaxer set-profile-url`. Invite gate, Turnstile, and later edit paths stay unchanged.

## Decisions

| Topic       | Choice                                                     |
| ----------- | ---------------------------------------------------------- |
| Approach    | Optional `url` on `POST /api/register` (single round-trip) |
| Required?   | No — omit / `""` / `null` → `profile_url = NULL`           |
| Validation  | Reuse `validateProfileUrl` (https, ≤2048, no credentials)  |
| Invite gate | Unchanged (`tt_invite` cookie + Turnstile)                 |
| Response    | Still `{ id, username, token }` (do not echo `url`)        |
| Later edits | Existing `POST /api/profile` + CLI                         |
| Browser UI  | Optional field on invite-unlocked `/start` claim form only |
| Schema      | No migration — `users.profile_url` already exists          |

## API

### `POST /api/register` (invite + Turnstile required)

**Request body:**

```json
{
    "username": "yourname",
    "turnstileToken": "…",
    "url": "https://example.com/me"
}
```

`url` is optional. Omitted, `""`, or `null` means no public link.

**Success (201):**

```json
{ "id": "…", "username": "yourname", "token": "tt_…" }
```

**Errors (unchanged unless noted):**

| Status | When                                  |
| ------ | ------------------------------------- |
| 403    | Invite required / Turnstile failed    |
| 400    | Invalid username **or** invalid `url` |
| 409    | Username taken                        |
| 429    | Rate limited                          |

**Insert:** When `url` validates to a string, bind it into `INSERT INTO users (…, profile_url)`. When null, store `NULL`.

## Browser UI (`/start`)

Only when `invited`:

- Optional “Profile URL” text input under username (placeholder e.g. `https://github.com/you`)
- Client includes `url` in the register JSON only when non-empty after trim
- API validation errors continue to show in `#err`
- Light copy tweak OK (mention optional public link); no layout redesign

Unauthenticated / non-invited `/start` behavior unchanged (invite-only notice; no form).

## Agent docs

Update `src/content/start.md.ts` claim example to include optional `"url"`, and note that the link can still be set later via `tokenmaxer set-profile-url`.

## Testing

| Case                           | Expect                                      |
| ------------------------------ | ------------------------------------------- |
| Register with valid `url`      | `201`; insert binds validated `profile_url` |
| Register without `url` / empty | `201`; `profile_url` null                   |
| Invalid `url`                  | `400`; no insert                            |
| No invite session              | `403 invite required`                       |
| `start.md`                     | Example JSON includes optional `url`        |
| `/start` HTML when invited     | Optional profile URL input present          |

`validateProfileUrl` unit coverage already exists; reuse profile-route / invite test mocking patterns for register.

## Out of scope

- Making profile URL required at claim
- Username rename / custom slug ≠ username
- Leaderboard link column
- Removing or changing `POST /api/profile` / CLI
- Schema migration

## Implementation sketch

1. `register.ts` — parse/validate optional `url`; extend INSERT
2. `start.tsx` — optional field + submit payload
3. `start.md.ts` — document optional `url`
4. Tests for register URL cases + invited form / markdown docs
