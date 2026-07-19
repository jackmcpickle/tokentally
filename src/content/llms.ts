export function llmsTxt(base: string): string {
    const b = base.replace(/\/$/u, '');
    return `# tokenmaxer.quest

> Public token leaderboard for AI builders (Claude Code, Codex, opencode, pi, Cursor). Self-reported session usage; no prompts or PII.

Prefer the Markdown links below. Live rankings also available as JSON.

## Docs

- [Leaderboard](${b}/index.md): Top builders — default top 10 · last 7 days
- [About](${b}/about.md): What is tracked, privacy, honor system
- [Pricing](${b}/pricing.md): Reference USD/MTok rates used for estimated cost
- [Get started](${b}/start.md): Claim username + reporter setup (invite cookie required when gate is on)
- [Profile pattern](${b}/u/USERNAME.md): Replace USERNAME — per-builder totals and model breakdown

## API

- [Leaderboard JSON](${b}/api/leaderboard): \`?window=&metric=&source=&model=&limit=\`
- [Profile JSON](${b}/api/u/:username): Totals + breakdown
- [Register](${b}/api/register): \`POST {username}\` (invite session when gated)
- [Update profile URL](${b}/api/profile): \`POST {url}\` (Bearer) — set or clear https link
- [Ingest](${b}/api/ingest): Bearer — live session upserts
- [History](${b}/api/history): Bearer — bulk backfill
- [Health](${b}/api/health): Service ping

## Optional

- [Full corpus](${b}/llms-full.txt): About + start guide inlined for one-shot context
`;
}
