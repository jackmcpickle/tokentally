import type { FC } from 'hono/jsx';
import type { LeaderboardEntry } from '@/lib/aggregate';
import { formatTokens, formatUsd } from '@/lib/format';
import { Button } from '@/pages/components/button';
import { Input } from '@/pages/components/input';
import { Layout } from '@/pages/layout';
import type { ChartMetric, ChartPeriod } from '@/pages/prototype/chart-mock';
import { ChartPrototype } from '@/pages/prototype/chart-variants';
import { PrototypeSwitcher } from '@/pages/prototype/switcher';
import {
    empty,
    filterLabel,
    filters,
    hero,
    heroActions,
    num,
    panel,
    sub,
} from '@/pages/ui';
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
    /** PROTOTYPE: when set, mounts chart variants + switcher above the board. */
    chartPrototype?: {
        variant: string;
        period: ChartPeriod;
        chartMetric: ChartMetric;
    };
}

function rankClass(rank: number): string {
    const weight =
        rank <= 3 ? 'font-semibold text-text' : 'font-medium text-muted';
    return `w-11 tabular-nums ${weight}`;
}

export const Home: FC<HomeProps> = (p) => (
    <Layout
        title="tokenmaxer.quest — token leaderboard for AI builders"
        base={p.base}
    >
        <section class={hero}>
            <h1 class="reveal wm">
                token<span class="max">maxer</span>
                <span class="tld">.quest</span>
            </h1>
            <p class={`${sub} reveal reveal-delay`}>
                The token leaderboard for Claude Code, Codex, opencode &amp; pi.
                Ranked by{' '}
                <strong class="text-text">{METRIC_LABELS[p.metric]}</strong> ·{' '}
                {WINDOW_LABELS[p.window]}.
            </p>
            <div class={`${heroActions} reveal reveal-delay-2`}>
                <Button
                    variant="primary"
                    href="/start"
                >
                    Claim a username
                </Button>
            </div>
        </section>

        {p.chartPrototype ? (
            <ChartPrototype
                variant={p.chartPrototype.variant}
                period={p.chartPrototype.period}
                metric={p.chartPrototype.chartMetric}
            />
        ) : null}

        <form
            class={filters}
            method="get"
            action="/"
        >
            <label
                class={filterLabel}
                htmlFor="filter-window"
            >
                Window
                <Input
                    variant="select"
                    id="filter-window"
                    name="window"
                >
                    {(['today', '7d', '30d', 'all'] as TimeWindow[]).map(
                        (w) => (
                            <option
                                key={w}
                                value={w}
                                selected={w === p.window}
                            >
                                {WINDOW_LABELS[w]}
                            </option>
                        ),
                    )}
                </Input>
            </label>
            <label
                class={filterLabel}
                htmlFor="filter-metric"
            >
                Rank by
                <Input
                    variant="select"
                    id="filter-metric"
                    name="metric"
                >
                    {(['total', 'io', 'output', 'cost'] as Metric[]).map(
                        (m) => (
                            <option
                                key={m}
                                value={m}
                                selected={m === p.metric}
                            >
                                {METRIC_LABELS[m]}
                            </option>
                        ),
                    )}
                </Input>
            </label>
            <label
                class={filterLabel}
                htmlFor="filter-source"
            >
                Source
                <Input
                    variant="select"
                    id="filter-source"
                    name="source"
                >
                    <option
                        value=""
                        selected={!p.source}
                    >
                        All
                    </option>
                    <option
                        value="claude_code"
                        selected={p.source === 'claude_code'}
                    >
                        Claude Code
                    </option>
                    <option
                        value="codex"
                        selected={p.source === 'codex'}
                    >
                        Codex
                    </option>
                    <option
                        value="opencode"
                        selected={p.source === 'opencode'}
                    >
                        opencode
                    </option>
                    <option
                        value="pi"
                        selected={p.source === 'pi'}
                    >
                        pi
                    </option>
                </Input>
            </label>
            <label
                class={filterLabel}
                htmlFor="filter-model"
            >
                Model
                <Input
                    variant="select"
                    id="filter-model"
                    name="model"
                >
                    <option
                        value=""
                        selected={!p.model}
                    >
                        All
                    </option>
                    {p.models.map((m) => (
                        <option
                            key={m}
                            value={m}
                            selected={m === p.model}
                        >
                            {m}
                        </option>
                    ))}
                </Input>
            </label>
            <div class={filterLabel}>
                <span
                    class="invisible select-none"
                    aria-hidden="true"
                >
                    &nbsp;
                </span>
                <Button
                    variant="primary"
                    type="submit"
                >
                    Apply
                </Button>
            </div>
        </form>

        <div class={panel}>
            {p.entries.length === 0 ? (
                <div class={empty}>
                    No builders on the board yet for this window.{' '}
                    <a href="/start">Be the first →</a>
                </div>
            ) : (
                <div class="overflow-x-auto">
                    <table>
                        <thead>
                            <tr>
                                <th class="w-11">#</th>
                                <th>Builder</th>
                                <th class={num}>Total</th>
                                <th class={num}>In+Out</th>
                                <th class={num}>Output</th>
                                <th class={num}>Est. cost</th>
                                <th class={num}>Sessions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {p.entries.map((e) => (
                                <tr key={e.username}>
                                    <td class={rankClass(e.rank)}>{e.rank}</td>
                                    <td>
                                        <a href={`/u/${e.username}`}>
                                            {e.username}
                                        </a>
                                    </td>
                                    <td class={num}>
                                        {formatTokens(e.grand_total)}
                                    </td>
                                    <td class={num}>
                                        {formatTokens(
                                            e.input_tokens + e.output_tokens,
                                        )}
                                    </td>
                                    <td class={num}>
                                        {formatTokens(e.output_tokens)}
                                    </td>
                                    <td class={num}>{formatUsd(e.cost)}</td>
                                    <td class={num}>{e.sessions}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>

        <aside class="spotlight spotlight-violet mt-4 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
                <p class="mb-2 text-[13px] font-medium tracking-[-0.13px] text-white/80">
                    Join the board
                </p>
                <p class="text-[22px] leading-snug tracking-[-0.01px] sm:text-[24px]">
                    Claim a username and start reporting sessions from Claude
                    Code, Codex, opencode or pi.
                </p>
            </div>
            <Button
                variant="primary"
                class="shrink-0"
                href="/start"
            >
                Get started
            </Button>
        </aside>

        {p.chartPrototype ? (
            <PrototypeSwitcher current={p.chartPrototype.variant} />
        ) : null}
    </Layout>
);
