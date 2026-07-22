export function privacyMarkdown(): string {
    return `# Privacy

We keep the bare minimum to run a token leaderboard, and nothing that could reveal what you were building.

## What we store

- **Username** — the public name you chose.
- **Country** — an ISO 3166-1 alpha-2 code you pick at signup, shown on your profile and used for the country leaderboard filter.
- **Per-session token counts** — input, output, cache read, cache write, and reasoning tokens, broken down by model and tool (Claude Code, Codex, opencode, pi, Cursor), plus the session id and timestamp.
- **Optional profile URL** — an \`https:\` link you may add; clearing it removes the link.
- **A SHA-256 hash of your token** — never the token itself.
- **A transient IP** — used only for short-lived rate limiting, not stored with your account.

## What we never store

- Prompts, code, diffs, or file paths.
- Email addresses or passwords.
- Your raw token — only its hash lives on the server.
- Any content from your sessions beyond the numeric token totals above.

## The token is your only key

There's no email and no password, so there's no recovery. The server keeps only a hash and can't recreate the secret. If you lose the token, that username is stranded — rotate it while you still hold it, or email us and we'll help sort it out.

## Honor system

Token counts are self-reported from your own machine, so this is an honor system with light guardrails — token-gated writes, rate limits, and sanity caps. See [About](/about.md) for how the numbers are read and summed.

## Contact

Questions, a lost token, or a data request? Email jackmcpickle@gmail.com.
`;
}
