import type { LeaderboardEntry } from '@/lib/aggregate';
import { formatTokens, formatUsd } from '@/lib/format';
import type { Source, TimeWindow } from '@/types';

const SOURCE_LABELS: Record<string, string> = {
    claude_code: 'Claude Code',
    codex: 'Codex',
    opencode: 'opencode',
    pi: 'pi',
    cursor: 'Cursor',
};

const WINDOW_LABELS: Record<TimeWindow, string> = {
    today: 'today',
    '7d': 'last 7 days',
    '30d': 'last 30 days',
    all: 'all time',
};

function row(cols: string[]): string {
    return `| ${cols.join(' | ')} |`;
}

const HEADER = row([
    'Rank',
    'Username',
    'Sessions',
    'Input',
    'Output',
    'Cache read',
    'Cache write',
    'Reasoning',
    'Total',
    'Est. cost',
]);
const DIVIDER = row(new Array(10).fill('---'));

export function homeMarkdown(opts: {
    base: string;
    entries: LeaderboardEntry[];
    window: TimeWindow;
    source?: Source;
    model?: string;
}): string {
    const { base, entries, window, source, model } = opts;

    const filters = [`window=${window}`];
    if (source)
        filters.push(`source=${source} (${SOURCE_LABELS[source] ?? source})`);
    if (model) filters.push(`model=${model}`);

    const table =
        entries.length === 0
            ? `${HEADER}\n${DIVIDER}\n\nNo entries yet.`
            : [
                  HEADER,
                  DIVIDER,
                  ...entries.map((e) =>
                      row([
                          String(e.rank),
                          e.username,
                          String(e.sessions),
                          formatTokens(e.input_tokens),
                          formatTokens(e.output_tokens),
                          formatTokens(e.cache_read_tokens),
                          formatTokens(e.cache_creation_tokens),
                          formatTokens(e.reasoning_tokens),
                          formatTokens(e.grand_total),
                          formatUsd(e.cost),
                      ]),
                  ),
              ].join('\n');

    return `# Leaderboard

Top 10 builders by total tokens — ${WINDOW_LABELS[window]}. This page is the same view as the default homepage (top 10, last 7 days) unless filters below are active.

Filters: ${filters.join(', ')}

${table}

Live JSON: \`${base}/api/leaderboard\`
`;
}
