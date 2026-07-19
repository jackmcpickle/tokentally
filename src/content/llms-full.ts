import { aboutMarkdown } from '@/content/about.md';
import { startMarkdown } from '@/content/start.md';

export function llmsFullTxt(base: string): string {
    const b = base.replace(/\/$/u, '');

    const intro = `# tokenmaxer.quest — full corpus

Inlined documentation for agents. Prefer live pages when possible; leaderboard rankings change over time.`;

    const apiBlurb = `## API

- [Leaderboard JSON](${b}/api/leaderboard): \`?window=&metric=&source=&model=&limit=\`
- [Profile JSON](${b}/api/u/:username): Totals + breakdown
- [Register](${b}/api/register): \`POST {username}\` (invite session when gated)
- [Ingest](${b}/api/ingest): Bearer — live session upserts
- [History](${b}/api/history): Bearer — bulk backfill
- [Health](${b}/api/health): Service ping`;

    const leaderboardPointer = `## Live leaderboard

Current rankings: [Leaderboard](${b}/index.md) · [JSON](${b}/api/leaderboard)`;

    return [
        intro,
        aboutMarkdown(),
        startMarkdown(b),
        apiBlurb,
        leaderboardPointer,
    ].join('\n\n---\n\n');
}
