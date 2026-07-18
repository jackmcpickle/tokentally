/**
 * PROTOTYPE — three chart UI variants for site-wide token tallies.
 * Switch with ?variant=A|B|C on /. Throwaway; fold winner into real pages later.
 *
 * A — Metric tabs (shadcn interactive-chart style)
 * B — Period-first full-bleed tally
 * C — Split rail: period nav + chart beside leaderboard density
 */
import type { FC } from 'hono/jsx';
import { Button } from '@/pages/components/button';
import { PrototypeAxis, PrototypeBars } from '@/pages/prototype/chart-bars';
import {
    CHART_METRICS,
    CHART_PERIODS,
    type ChartMetric,
    type ChartPeriod,
    METRIC_LABELS,
    PERIOD_HINTS,
    PERIOD_LABELS,
    chartHref,
    formatMetric,
    mockSeries,
    seriesTotal,
} from '@/pages/prototype/chart-mock';

export interface ChartVariantProps {
    variant: string;
    period: ChartPeriod;
    metric: ChartMetric;
}

export const VARIANT_NAMES: Record<string, string> = {
    A: 'Metric tabs',
    B: 'Period-first',
    C: 'Split rail',
};

/** A — shadcn-style: period pills + metric header tabs drive a single series. */
export const VariantA: FC<ChartVariantProps> = ({
    variant,
    period,
    metric,
}) => {
    const points = mockSeries(period);
    return (
        <section class="mb-8 overflow-hidden rounded-lg border border-border bg-panel">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                <div>
                    <div class="text-xs tracking-[0.06em] text-muted uppercase">
                        Site tally
                    </div>
                    <div class="text-lg font-extrabold tracking-[-0.02em]">
                        {PERIOD_LABELS[period]} tokens
                    </div>
                    <div class="text-xs text-muted">{PERIOD_HINTS[period]}</div>
                </div>
                <div class="flex rounded-lg border border-border bg-panel2 p-0.5">
                    {CHART_PERIODS.map((p) => (
                        <Button
                            key={p}
                            variant={p === period ? 'primary' : 'ghost'}
                            href={chartHref(variant, p, metric)}
                            class="!min-h-0 rounded-md px-3 py-1.5 text-sm font-bold"
                        >
                            {PERIOD_LABELS[p]}
                        </Button>
                    ))}
                </div>
            </div>

            <div class="flex flex-col border-b border-border sm:flex-row">
                {CHART_METRICS.map((m) => {
                    const total = seriesTotal(points, m);
                    const active = m === metric;
                    return (
                        <Button
                            key={m}
                            variant={active ? 'secondary' : 'ghost'}
                            href={chartHref(variant, period, m)}
                            class={`!min-h-0 flex-1 flex-col justify-center gap-1 rounded-none border-t border-border px-5 py-4 first:border-t-0 sm:border-t-0 sm:border-l sm:first:border-l-0 ${
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
                                {formatMetric(m, total)}
                            </span>
                        </Button>
                    );
                })}
            </div>

            <div class="px-3 pt-5 pb-4 sm:px-5">
                <PrototypeBars
                    points={points}
                    metric={metric}
                />
                <PrototypeAxis points={points} />
                <p class="mt-3 text-[12px] text-muted">
                    Hot link:{' '}
                    <code class="text-text">
                        /charts/{period}?metric={metric}
                    </code>
                </p>
            </div>
        </section>
    );
};

/** B — Period is the page: huge period title, metric chips, airy chart. */
export const VariantB: FC<ChartVariantProps> = ({
    variant,
    period,
    metric,
}) => {
    const points = mockSeries(period);
    const total = seriesTotal(points, metric);
    return (
        <section class="mb-8">
            <div class="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
                <div>
                    <p class="mb-1 text-xs tracking-[0.08em] text-muted uppercase">
                        /charts/{period}
                    </p>
                    <h2 class="m-0 text-[40px] leading-none font-extrabold tracking-[-0.04em]">
                        {PERIOD_LABELS[period]}
                    </h2>
                    <p class="mt-2 mb-0 text-muted">{PERIOD_HINTS[period]}</p>
                </div>
                <div class="text-right">
                    <div class="text-xs tracking-[0.04em] text-muted uppercase">
                        {METRIC_LABELS[metric]} total
                    </div>
                    <div class="text-4xl font-extrabold tracking-[-0.03em] text-text tabular-nums">
                        {formatMetric(metric, total)}
                    </div>
                </div>
            </div>

            <nav class="mb-4 flex flex-wrap gap-2">
                {CHART_PERIODS.map((p) => (
                    <Button
                        key={p}
                        variant={p === period ? 'primary' : 'ghost'}
                        href={chartHref(variant, p, metric)}
                        class="!min-h-0 px-4 py-2 text-sm font-bold"
                    >
                        {PERIOD_LABELS[p]}
                    </Button>
                ))}
            </nav>

            <div class="mb-5 flex flex-wrap gap-2">
                {CHART_METRICS.map((m) => (
                    <Button
                        key={m}
                        variant={m === metric ? 'primary' : 'ghost'}
                        href={chartHref(variant, period, m)}
                        class="!min-h-0 px-3 py-1.5 text-sm"
                    >
                        {METRIC_LABELS[m]}
                    </Button>
                ))}
            </div>

            <div class="rounded-lg border border-border/80 bg-gradient-to-b from-panel2 to-bg px-2 pt-8 pb-4 sm:px-4">
                <PrototypeBars
                    points={points}
                    metric={metric}
                    height={280}
                />
                <PrototypeAxis points={points} />
            </div>
        </section>
    );
};

/** C — Split rail: vertical period nav, chart column, denser controls. */
export const VariantC: FC<ChartVariantProps> = ({
    variant,
    period,
    metric,
}) => {
    const points = mockSeries(period);
    return (
        <section class="mb-8 grid gap-4 md:grid-cols-[160px_1fr]">
            <aside class="rounded-lg border border-border bg-panel2 p-2">
                <div class="px-2.5 py-2 text-[11px] tracking-[0.06em] text-muted uppercase">
                    Period
                </div>
                {CHART_PERIODS.map((p) => (
                    <Button
                        key={p}
                        variant={p === period ? 'primary' : 'ghost'}
                        href={chartHref(variant, p, metric)}
                        class="mb-1 !min-h-0 w-full flex-col items-start gap-0.5 rounded-md px-3 py-3"
                    >
                        <span class="text-sm font-bold">
                            {PERIOD_LABELS[p]}
                        </span>
                        <span
                            class={`text-[11px] leading-snug font-medium ${
                                p === period ? 'text-bg/80' : 'text-muted'
                            }`}
                        >
                            {p === 'daily'
                                ? '30 days'
                                : p === 'weekly'
                                  ? '12 weeks'
                                  : '12 months'}
                        </span>
                    </Button>
                ))}
            </aside>

            <div class="rounded-lg border border-border bg-panel p-4">
                <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 class="m-0 text-xl font-extrabold">
                            {PERIOD_LABELS[period]} site tally
                        </h2>
                        <p class="m-0 text-xs text-muted">
                            {PERIOD_HINTS[period]} · share{' '}
                            <code>
                                /charts/{period}?metric={metric}
                            </code>
                        </p>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                        {CHART_METRICS.map((m) => (
                            <Button
                                key={m}
                                variant={m === metric ? 'primary' : 'ghost'}
                                href={chartHref(variant, period, m)}
                                class="!min-h-0 px-2.5 py-1 text-xs font-bold"
                            >
                                {METRIC_LABELS[m]}
                            </Button>
                        ))}
                    </div>
                </div>

                <div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {CHART_METRICS.map((m) => (
                        <Button
                            key={m}
                            variant={m === metric ? 'primary' : 'secondary'}
                            href={chartHref(variant, period, m)}
                            class="h-auto !min-h-0 w-full flex-col items-start gap-1 rounded-md px-3 py-2"
                        >
                            <span class="text-[10px] font-medium text-muted uppercase">
                                {METRIC_LABELS[m]}
                            </span>
                            <span class="text-sm font-bold tabular-nums">
                                {formatMetric(m, seriesTotal(points, m))}
                            </span>
                        </Button>
                    ))}
                </div>

                <PrototypeBars
                    points={points}
                    metric={metric}
                    height={200}
                />
                <PrototypeAxis points={points} />
            </div>
        </section>
    );
};

export const ChartPrototype: FC<ChartVariantProps> = (props) => {
    if (props.variant === 'B') return <VariantB {...props} />;
    if (props.variant === 'C') return <VariantC {...props} />;
    return <VariantA {...props} />;
};
