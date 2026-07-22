import type { FC } from 'hono/jsx';
import { type LeaderboardEntry, metricValue } from '@/lib/aggregate';
import { formatTokens, formatUsd } from '@/lib/format';
import { Button } from '@/pages/components/button';
import { empty } from '@/pages/ui';
import { METRICS, type Metric } from '@/types';

export const METRIC_LABELS: Record<Metric, string> = {
    total: 'All tokens',
    input: 'Input',
    output: 'Output',
    cached: 'Cached',
    cost: 'Cost',
};

export function formatMetric(metric: Metric, n: number): string {
    return metric === 'cost' ? formatUsd(n) : formatTokens(n);
}

export const HackathonBoard: FC<{
    slug: string;
    metric: Metric;
    entries: LeaderboardEntry[];
}> = ({ slug, metric, entries }) => {
    const max = Math.max(...entries.map((e) => metricValue(e, metric)), 1);
    return (
        <section class="mb-8 overflow-hidden rounded-lg border border-border bg-panel">
            <div class="flex flex-col border-b border-border sm:flex-row">
                {METRICS.map((m) => {
                    const active = m === metric;
                    return (
                        <Button
                            key={m}
                            variant={active ? 'secondary' : 'ghost'}
                            href={`/h/${slug}?metric=${m}`}
                            class={`!min-h-0 flex-1 rounded-none border-t border-border px-4 py-3 text-sm font-bold first:border-t-0 sm:border-t-0 sm:border-l sm:first:border-l-0 ${
                                active ? 'bg-panel2 text-text' : 'text-muted'
                            }`}
                        >
                            {METRIC_LABELS[m]}
                        </Button>
                    );
                })}
            </div>
            <div class="px-3 pt-4 pb-4 sm:px-5">
                {entries.length === 0 ? (
                    <div class={empty}>No usage counted yet.</div>
                ) : (
                    <div class="flex flex-col gap-1">
                        {entries.map((e) => {
                            const value = metricValue(e, metric);
                            const pct = Math.max(
                                4,
                                Math.round((value / max) * 100),
                            );
                            return (
                                <div
                                    key={e.username}
                                    class="grid grid-cols-[2.5rem_8rem_1fr_5rem] items-center gap-2 rounded-md px-1 py-1.5 hover:bg-panel2"
                                >
                                    <span class="text-xs font-semibold text-muted tabular-nums">
                                        #{e.rank}
                                    </span>
                                    <a
                                        href={`/u/${e.username}`}
                                        class="truncate text-sm font-semibold text-text no-underline"
                                    >
                                        {e.username}
                                    </a>
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
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
};
