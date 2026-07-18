import type { FC } from 'hono/jsx';
import { formatTokens, formatUsd } from '@/lib/format';
import type { LeaderboardEntry } from '@/lib/aggregate';
import { Layout } from '@/pages/layout';
import type { Metric, Source, TimeWindow } from '@/types';

const WINDOW_LABELS: Record<TimeWindow, string> = {
    today: 'Today',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    all: 'All time',
};
const METRIC_LABELS: Record<Metric, string> = {
    total: 'Total tokens',
    io: 'Input + output',
    output: 'Output only',
    cost: 'Est. cost',
};

interface HomeProps {
    base: string;
    entries: LeaderboardEntry[];
    models: string[];
    window: TimeWindow;
    metric: Metric;
    source: Source | undefined;
    model: string | undefined;
}

function rankClass(rank: number): string {
    return rank <= 3 ? `rank r${rank}` : 'rank';
}

export const Home: FC<HomeProps> = (p) => (
    <Layout title="TokenTally — token leaderboard for AI builders" base={p.base}>
        <h1>The token leaderboard</h1>
        <p class="sub">
            Who's burning the most tokens building with Claude Code &amp; Codex. Ranked by{' '}
            <strong>{METRIC_LABELS[p.metric]}</strong> · {WINDOW_LABELS[p.window]}.
        </p>

        <form class="filters" method="get" action="/">
            <label>
                Window
                <select name="window">
                    {(['today', '7d', '30d', 'all'] as TimeWindow[]).map((w) => (
                        <option value={w} selected={w === p.window}>
                            {WINDOW_LABELS[w]}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Rank by
                <select name="metric">
                    {(['total', 'io', 'output', 'cost'] as Metric[]).map((m) => (
                        <option value={m} selected={m === p.metric}>
                            {METRIC_LABELS[m]}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Source
                <select name="source">
                    <option value="" selected={!p.source}>
                        All
                    </option>
                    <option value="claude_code" selected={p.source === 'claude_code'}>
                        Claude Code
                    </option>
                    <option value="codex" selected={p.source === 'codex'}>
                        Codex
                    </option>
                </select>
            </label>
            <label>
                Model
                <select name="model">
                    <option value="" selected={!p.model}>
                        All
                    </option>
                    {p.models.map((m) => (
                        <option value={m} selected={m === p.model}>
                            {m}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                &nbsp;
                <button type="submit">Apply</button>
            </label>
        </form>

        <div class="panel">
            {p.entries.length === 0 ? (
                <div class="empty">
                    No builders on the board yet for this window.{' '}
                    <a href="/start">Be the first →</a>
                </div>
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th class="rank">#</th>
                            <th>Builder</th>
                            <th class="num">Total</th>
                            <th class="num">In+Out</th>
                            <th class="num">Output</th>
                            <th class="num">Est. cost</th>
                            <th class="num">Sessions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {p.entries.map((e) => (
                            <tr>
                                <td class={rankClass(e.rank)}>{e.rank}</td>
                                <td>
                                    <a href={`/u/${e.username}`}>{e.username}</a>
                                </td>
                                <td class="num">{formatTokens(e.grand_total)}</td>
                                <td class="num">
                                    {formatTokens(e.input_tokens + e.output_tokens)}
                                </td>
                                <td class="num">{formatTokens(e.output_tokens)}</td>
                                <td class="num">{formatUsd(e.cost)}</td>
                                <td class="num">{e.sessions}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    </Layout>
);
