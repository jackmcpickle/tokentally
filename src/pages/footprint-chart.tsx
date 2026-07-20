import type { FC } from 'hono/jsx';
import { formatTokens } from '@/lib/format';
import {
    type ImpactEstimate,
    type ImpactMetric,
    type ImpactRegion,
    type ImpactScenario,
    IMPACT_METRIC_LABELS,
    IMPACT_METRICS,
    IMPACT_REGION_LABELS,
    IMPACT_REGIONS,
    IMPACT_SCENARIO_LABELS,
    IMPACT_SCENARIOS,
    formatHouseholdPercent,
    formatImpact,
    householdBaseline,
    householdPercent,
    impactValue,
} from '@/lib/impact';
import { Button } from '@/pages/components/button';
import { empty } from '@/pages/ui';
import { TIME_WINDOWS, type TimeWindow } from '@/types';

const WINDOW_LABELS: Record<TimeWindow, string> = {
    today: 'Today',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    all: 'All time',
};

export interface FootprintEntry {
    rank: number;
    username: string;
    sessions: number;
    grand_total: number;
    impact: ImpactEstimate;
}

interface BoardQuery {
    window: TimeWindow;
    metric: ImpactMetric;
    scenario: ImpactScenario;
    region: ImpactRegion;
    source?: string;
    model?: string;
}

function boardHref(q: BoardQuery): string {
    const params = new URLSearchParams({
        window: q.window,
        metric: q.metric,
        scenario: q.scenario,
        region: q.region,
    });
    if (q.source) params.set('source', q.source);
    if (q.model) params.set('model', q.model);
    return `/footprint?${params.toString()}`;
}

function entryTotals(entries: FootprintEntry[]): Record<ImpactMetric, number> {
    const totals = { energy: 0, water: 0, co2: 0 } satisfies Record<
        ImpactMetric,
        number
    >;
    for (const e of entries) {
        for (const m of IMPACT_METRICS) totals[m] += impactValue(e.impact, m);
    }
    return totals;
}

function tipLines(
    e: FootprintEntry,
    metric: ImpactMetric,
    window: TimeWindow,
    region: ImpactRegion,
): string[] {
    const value = impactValue(e.impact, metric);
    const others = IMPACT_METRICS.filter((m) => m !== metric).map(
        (m) =>
            `${IMPACT_METRIC_LABELS[m]} ${formatImpact(m, impactValue(e.impact, m))}`,
    );
    const pct = householdPercent(
        value,
        householdBaseline(region, window, metric),
    );
    return [
        `#${e.rank} @${e.username}`,
        `${IMPACT_METRIC_LABELS[metric]} ${formatImpact(metric, value)}`,
        formatHouseholdPercent(pct, window),
        `Avg household: 2 adults + 2 children · ${IMPACT_REGION_LABELS[region]}`,
        others.join(' · '),
        `${e.sessions} sessions · ${formatTokens(e.grand_total)} tokens`,
    ];
}

export const FootprintChart: FC<{
    entries: FootprintEntry[];
    window: TimeWindow;
    metric: ImpactMetric;
    scenario: ImpactScenario;
    region: ImpactRegion;
    source?: string;
    model?: string;
}> = ({ entries, window, metric, scenario, region, source, model }) => {
    const query: BoardQuery = {
        window,
        metric,
        scenario,
        region,
        source,
        model,
    };
    const totals = entryTotals(entries);
    const max = Math.max(
        ...entries.map((e) => impactValue(e.impact, metric)),
        1e-12,
    );
    const household = householdBaseline(region, window, metric);

    return (
        <section class="mb-8 overflow-hidden rounded-lg border border-border bg-panel">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                <div>
                    <div class="text-xs tracking-[0.06em] text-muted uppercase">
                        Footprint
                    </div>
                    <div class="text-lg font-extrabold tracking-[-0.02em]">
                        Ranked by {IMPACT_METRIC_LABELS[metric].toLowerCase()}
                    </div>
                    <div class="text-xs text-muted">
                        {WINDOW_LABELS[window]} ·{' '}
                        {IMPACT_SCENARIO_LABELS[scenario]} ·{' '}
                        {IMPACT_REGION_LABELS[region]}
                    </div>
                </div>
                <div class="flex flex-wrap rounded-lg border border-border bg-panel2 p-0.5">
                    {TIME_WINDOWS.map((w) => (
                        <Button
                            key={w}
                            variant={w === window ? 'primary' : 'ghost'}
                            href={boardHref({ ...query, window: w })}
                            class="!min-h-0 rounded-md px-3 py-1.5 text-sm font-bold"
                        >
                            {WINDOW_LABELS[w]}
                        </Button>
                    ))}
                </div>
            </div>

            <div class="flex flex-col border-b border-border sm:flex-row">
                {IMPACT_METRICS.map((m) => {
                    const active = m === metric;
                    return (
                        <Button
                            key={m}
                            variant={active ? 'secondary' : 'ghost'}
                            href={boardHref({ ...query, metric: m })}
                            class={`!min-h-0 flex-1 flex-col justify-center gap-1 rounded-none border-t border-border px-4 py-4 first:border-t-0 sm:border-t-0 sm:border-l sm:first:border-l-0 ${
                                active ? 'bg-panel2' : ''
                            }`}
                        >
                            <span class="text-xs font-medium text-muted">
                                {IMPACT_METRIC_LABELS[m]}
                            </span>
                            <span
                                class={`text-xl leading-none font-extrabold tabular-nums sm:text-2xl ${
                                    active ? 'text-text' : 'text-muted'
                                }`}
                            >
                                {formatImpact(m, totals[m])}
                            </span>
                        </Button>
                    );
                })}
            </div>

            <div class="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
                <span class="text-xs font-medium tracking-[0.04em] text-muted uppercase">
                    Scenario
                </span>
                <div class="flex flex-wrap rounded-lg border border-border bg-panel2 p-0.5">
                    {IMPACT_SCENARIOS.map((s) => (
                        <Button
                            key={s}
                            variant={s === scenario ? 'primary' : 'ghost'}
                            href={boardHref({ ...query, scenario: s })}
                            class="!min-h-0 rounded-md px-3 py-1.5 text-sm font-bold"
                        >
                            {IMPACT_SCENARIO_LABELS[s]}
                        </Button>
                    ))}
                </div>
                <span class="ml-2 text-xs font-medium tracking-[0.04em] text-muted uppercase">
                    Region
                </span>
                <div class="flex flex-wrap rounded-lg border border-border bg-panel2 p-0.5">
                    {IMPACT_REGIONS.map((r) => (
                        <Button
                            key={r}
                            variant={r === region ? 'primary' : 'ghost'}
                            href={boardHref({ ...query, region: r })}
                            class="!min-h-0 rounded-md px-2.5 py-1.5 text-sm font-bold"
                        >
                            {IMPACT_REGION_LABELS[r]}
                        </Button>
                    ))}
                </div>
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
                            const value = impactValue(e.impact, metric);
                            const barPct = Math.max(
                                4,
                                Math.round((value / max) * 100),
                            );
                            const hhPct = householdPercent(value, household);
                            const tip = tipLines(e, metric, window, region);
                            return (
                                <details
                                    key={e.username}
                                    class="group rounded-md open:bg-panel2 hover:bg-panel2"
                                >
                                    <summary class="grid cursor-pointer list-none grid-cols-[2.5rem_7rem_1fr_minmax(6.5rem,auto)] items-center gap-2 px-1 py-1.5 [&::-webkit-details-marker]:hidden">
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
                                                width={String(barPct)}
                                                height="12"
                                                class="fill-accent"
                                            />
                                        </svg>
                                        <span class="text-right leading-tight">
                                            <span class="block text-sm font-semibold text-text tabular-nums">
                                                {formatImpact(metric, value)}
                                            </span>
                                            <span class="block text-[11px] text-muted tabular-nums">
                                                {formatHouseholdPercent(
                                                    hhPct,
                                                    window,
                                                )}
                                            </span>
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

export { WINDOW_LABELS };
