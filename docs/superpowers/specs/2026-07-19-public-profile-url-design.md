# Public Profile URL — Design

Date: 2026-07-19  
Status: approved for planning  
Stack: Hono on Cloudflare Workers + `tokenmaxer` CLI reporter

## Goal

Let a token holder set or clear an optional **external** public profile URL on their account. The link appears on their tokentally profile (HTML, Markdown, JSON). Users update it via Bearer API and/or the `tokenmaxer` CLI. No browser form, no username rename.

## Decisions

| Topic        | Choice                                                             |
| ------------ | ------------------------------------------------------------------ |
| Link meaning | Optional external URL (GitHub, personal site, etc.)                |
| Auth         | Existing Bearer token (`Authorization: Bearer tt_…`)               |
| Write API    | `POST /api/profile` with `{ "url": "…" }` (matches `token/rotate`) |
| Validation   | `https:` only; max 2048 chars; `""` / `null` clears                |
| Display      | Profile only: `/u/:username`, `.md` twin, `GET /api/u/:username`   |
| Leaderboard  | No link column                                                     |
| CLI          | `tokenmaxer set-profile-url <url>` / `--clear`                     |
| Username     | Unchanged (claim once; not editable)                               |
| Browser UI   | Out of scope                                                       |

## Data model

Add nullable column on `users`:

```sql
ALTER TABLE users ADD COLUMN profile_url TEXT;
```

- `NULL` / unset = no public link
- Stored value is the validated absolute `https:` URL string
- No uniqueness constraint (many users may share a site)

Migration: `drizzle/0002_profile_url.sql` (next number after `0001_drop_synthetic_models.sql`).

## API

### `POST /api/profile` (Bearer required)

**Request body:**

```json
{ "url": "https://example.com/me" }
```

Clear with `"url": ""` or `"url": null`.

**Success (200):**

```json
{ "username": "alice", "url": "https://example.com/me" }
```

When cleared, `"url": null`.

**Errors:**

| Status | When                                |
| ------ | ----------------------------------- |
| 401    | Missing/invalid Bearer              |
| 400    | Invalid URL (scheme, parse, length) |
| 429    | Rate limited                        |

**Rate limit:** 20 requests / hour per user id via the existing KV `rateLimit` helper (`rl:profile:${user.id}`).

**CORS:** stays GET/POST/OPTIONS — no PATCH.

### Public reads

- `GET /api/u/:username` — include `url: string | null` on the profile JSON
- `getProfile()` selects `profile_url` and maps it to `url` on the `Profile` type
- HTML profile page: when set, render one outbound link near the username/hero
- Markdown profile: include the URL when set (plain Markdown link)

## Validation (`validateProfileUrl`)

In `src/lib/validate.ts`:

1. `null` or `""` (after trim) → clear (`ok`, value `null`)
2. Non-string → error
3. Trim; length 1–2048
4. Parse with `URL`; require `protocol === 'https:'`
5. Reject credentials in URL (`username`/`password` on the URL object)
6. Return normalized `href` (or equivalently the validated string)

Reject `http:`, `javascript:`, `data:`, relative paths, and bare hostnames without a scheme.

## CLI (`tokenmaxer`)

New commands on `reporter/tokentally.mjs`:

```
tokenmaxer set-profile-url <https-url>
tokenmaxer set-profile-url --clear
```

Behavior:

- Load `apiBase` + `token` from `~/.tokentally/config.json` (env overrides unchanged)
- `POST {apiBase}/api/profile` with `Authorization: Bearer <token>` and JSON body
- Support global `--dry-run`: print method, URL, headers (redact token), and body; do not send
- Exit 0 on success; print resulting `url` (or that it was cleared)
- Exit non-zero on config/auth/validation/network errors; print API `error` when present

Header comment usage block and `reporter/README.md` list the new command.

## Docs

Update:

| Surface                      | Change                                                               |
| ---------------------------- | -------------------------------------------------------------------- |
| Root `README.md` API table   | Add `POST /api/profile`                                              |
| Root `README.md` onboarding  | Optional one-liner for `set-profile-url`                             |
| `reporter/README.md` Usage   | Document `set-profile-url` / `--clear`                               |
| `/about` + about Markdown    | Optional public profile link is allowed                              |
| `llms.txt` / `llms-full.txt` | Mention `POST /api/profile` and CLI if those indexes list write APIs |

Keep privacy framing: still no email; the link is opt-in public content the user chooses to publish.

## Testing

- Unit: `validateProfileUrl` — https ok, http/javascript/relative rejected, clear, max length, credentials rejected
- Route: unauthorized; set; clear; invalid body; rate limit optional if easy to stub
- Profile read: JSON/`getProfile` returns `url`
- Reporter: dry-run payload shape for `set-profile-url` and `--clear` (same style as existing reporter tests)

## Out of scope

- Username rename / slug change
- Browser settings form
- Leaderboard link display
- `http:` URLs
- Multiple links / social icon sets / bio text
- Storing the URL in `config.json` (server is source of truth)

## Implementation sketch

1. Migration + `Profile.url` + `getProfile` SELECT
2. `validateProfileUrl` + `POST /api/profile` route (register routes file or small `profile.ts`)
3. HTML + Markdown profile rendering
4. CLI command + reporter tests
5. README / about / reporter docs
