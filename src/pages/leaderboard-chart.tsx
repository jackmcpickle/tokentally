import type { FC } from 'hono/jsx';
import {
    type LeaderboardEntry,
    grandTotal,
    metricValue,
} from '@/lib/aggregate';
import { formatTokens, formatUsd } from '@/lib/format';
import { Button } from '@/pages/components/button';
import { empty } from '@/pages/ui';
import { METRICS, type Metric, type TimeWindow } from '@/types';

const WINDOW_LABELS: Record<TimeWindow, string> = {
    today: 'Today',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    all: 'All time',
};

const METRIC_LABELS: Record<Metric, string> = {
    total: 'All tokens',
    input: 'Input',
    output: 'Output',
    cached: 'Cached',
    cost: 'Cost',
};

const WINDOWS: readonly TimeWindow[] = ['today', '7d', '30d', 'all'];

function formatMetric(metric: Metric, n: number): string {
    return metric === 'cost' ? formatUsd(n) : formatTokens(n);
}

function boardHref(opts: {
    window: TimeWindow;
    metric: Metric;
    source?: string;
    model?: string;
    country?: string;
}): string {
    const q = new URLSearchParams();
    q.set('window', opts.window);
    q.set('metric', opts.metric);
    if (opts.source) q.set('source', opts.source);
    if (opts.model) q.set('model', opts.model);
    if (opts.country) q.set('country', opts.country);
    return `/?${q.toString()}`;
}

function entryTotals(entries: LeaderboardEntry[]): Record<Metric, number> {
    const totals = {
        total: 0,
        input: 0,
        output: 0,
        cached: 0,
        cost: 0,
    } satisfies Record<Metric, number>;
    for (const e of entries) {
        for (const m of METRICS) totals[m] += metricValue(e, m);
    }
    return totals;
}

function tipLines(e: LeaderboardEntry, metric: Metric): string[] {
    const others = METRICS.filter((m) => m !== metric).map(
        (m) => `${METRIC_LABELS[m]} ${formatMetric(m, metricValue(e, m))}`,
    );
    return [
        `#${e.rank} @${e.username}`,
        `${METRIC_LABELS[metric]} ${formatMetric(metric, metricValue(e, metric))}`,
        others.join(' · '),
        `${e.sessions} sessions · ${formatTokens(grandTotal(e))} all tokens`,
    ];
}

export const LeaderboardChart: FC<{
    entries: LeaderboardEntry[];
    window: TimeWindow;
    metric: Metric;
    source?: string;
    model?: string;
    country?: string;
}> = ({ entries, window, metric, source, model, country }) => {
    const totals = entryTotals(entries);
    const max = Math.max(...entries.map((e) => metricValue(e, metric)), 1);

    return (
        <section class="mb-8 overflow-hidden rounded-lg border border-border bg-panel">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                <div>
                    <div class="text-xs tracking-[0.06em] text-muted uppercase">
                        Leaderboard
                    </div>
                    <div class="text-lg font-extrabold tracking-[-0.02em]">
                        Ranked by {METRIC_LABELS[metric].toLowerCase()}
                    </div>
                    <div class="text-xs text-muted">
                        {WINDOW_LABELS[window]}
                    </div>
                </div>
                <div class="flex flex-wrap rounded-lg border border-border bg-panel2 p-0.5">
                    {WINDOWS.map((w) => (
                        <Button
                            key={w}
                            variant={w === window ? 'primary' : 'ghost'}
                            href={boardHref({
                                window: w,
                                metric,
                                source,
                                model,
                                country,
                            })}
                            class="!min-h-0 rounded-md px-3 py-1.5 text-sm font-bold"
                        >
                            {WINDOW_LABELS[w]}
                        </Button>
                    ))}
                </div>
            </div>

            <div class="flex flex-col border-b border-border sm:flex-row">
                {METRICS.map((m) => {
                    const active = m === metric;
                    return (
                        <Button
                            key={m}
                            variant={active ? 'secondary' : 'ghost'}
                            href={boardHref({
                                window,
                                metric: m,
                                source,
                                model,
                                country,
                            })}
                            class={`!min-h-0 flex-1 flex-col justify-center gap-1 rounded-none border-t border-border px-4 py-4 first:border-t-0 sm:border-t-0 sm:border-l sm:first:border-l-0 ${
                                active ? 'bg-panel2' : ''
                            }`}
                        >
                            <span class="text-xs font-medium text-muted">
                                {METRIC_LABELS[m]}
                            </span>
                            <span
                                class={`text-xl leading-none font-extrabold tabular-nums sm:text-2xl ${
                                    active ? 'text-text' : 'text-muted'
                                }`}
                            >
                                {formatMetric(m, totals[m])}
                            </span>
                        </Button>
                    );
                })}
            </div>

            <div class="px-3 pt-4 pb-4 sm:px-5">
                {entries.length === 0 ? (
                    <div class={empty}>
                        No builders on the board yet for this window.{' '}
                        <a href="/start">Be the first →</a>
                    </div>
                ) : (
                    <div class="flex flex-col gap-1">
                        {entries.map((e) => {
                            const value = metricValue(e, metric);
                            const pct = Math.max(
                                4,
                                Math.round((value / max) * 100),
                            );
                            const tip = tipLines(e, metric);
                            return (
                                <details
                                    key={e.username}
                                    class="group rounded-md open:bg-panel2 hover:bg-panel2"
                                >
                                    <summary class="grid cursor-pointer list-none grid-cols-[2.5rem_7rem_1fr_4.5rem] items-center gap-2 px-1 py-1.5 [&::-webkit-details-marker]:hidden">
                                        <span class="text-xs font-semibold text-muted tabular-nums">
                                            #{e.rank}
                                        </span>
                                        <span class="truncate text-sm font-semibold text-text">
                                            {e.username}
                                        </span>
                                        <svg
                                            class="h-3 w-full overflow-hidden rounded-sm bg-panel2"
                                            viewBox="0 0 100 12"
                                            preserveAspectRatio="none"
                                            aria-hidden="true"
                                        >
                                            <rect
                                                x="0"
                                                y="0"
                                                width={String(pct)}
                                                height="12"
                                                class="fill-accent"
                                            />
                                        </svg>
                                        <span class="text-right text-sm font-semibold text-text tabular-nums">
                                            {formatMetric(metric, value)}
                                        </span>
                                    </summary>
                                    <div class="border-t border-border px-3 py-2 text-xs leading-relaxed text-muted">
                                        {tip.map((line) => (
                                            <div
                                                key={line}
                                                class="text-text first:font-semibold"
                                            >
                                                {line}
                                            </div>
                                        ))}
                                        <a
                                            class="mt-2 inline-block font-medium text-accent"
                                            href={`/u/${e.username}`}
                                        >
                                            View profile →
                                        </a>
                                    </div>
                                </details>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
};

export { METRIC_LABELS, WINDOW_LABELS };
