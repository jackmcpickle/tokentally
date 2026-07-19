export function aboutMarkdown(): string {
    return `# About tokenmaxer.quest

A public leaderboard of tokens burned by AI builders — nothing more.

## What it tracks

For each coding session, tokenmaxer.quest stores only token counts — input, output, cache read, cache write, and reasoning tokens — broken down by model and by tool (Claude Code, Codex, opencode, pi, or Cursor). That's it. No prompts, no code, no file paths, no email, no IP beyond transient rate-limiting. The leaderboard can rank by total tokens, input+output, output only, or estimated cost. Reference rates for that estimate are listed on [Pricing](/pricing.md).

## Where the numbers come from

Claude Code, Codex, opencode, pi, and Cursor each write local session files (or expose usage via a dashboard API for Cursor). The reporter reads those files — the same ones community tools like \`ccusage\` parse — sums the usage per model, and posts the totals. Hook payloads themselves don't contain token counts, so the reporter reads the session files directly:

- **Claude Code:** \`~/.claude/projects/**/<session>.jsonl\` — the \`usage\` block on each assistant message.
- **Codex:** \`~/.codex/sessions/**/rollout-*.jsonl\` — the last \`token_count\` event per session.
- **opencode:** \`~/.local/share/opencode/storage/message/<session>/*.json\` — the \`tokens\` block on each assistant message.
- **pi:** \`~/.pi/agent/sessions/**/*.jsonl\` — the \`usage\` on each assistant record (deduped by id).
- **Cursor:** Cursor's dashboard API — synced on each session via a hook (no local session token files).

Reporting is triggered by **SessionStart** and **SessionEnd** hooks — no background daemon, no cron. Because each session is keyed by its id and the server overwrites rather than adds, re-reporting the same session never double-counts.

## The honest part

Token counts are self-reported. There's no way to cryptographically prove numbers generated on someone's own machine, so this is an honor system. We apply light guardrails — token-gated writes, rate limits, and sanity caps — and keep raw session ids so blatant anomalies are auditable. Treat the ranking as fun, not audited fact.

## Accounts & privacy

You pick a username and get a secret token. The token is the only credential; we store just a SHA-256 hash of it, never the token itself. There's no email and no recovery — if you lose the token, that username is stranded (you can rotate the token while you still hold it). You may optionally publish an external profile URL (\`https:\` only) via \`POST /api/profile\`; it appears on your public profile. Clearing it removes the link. Everything else remains non-PII by default.
`;
}
