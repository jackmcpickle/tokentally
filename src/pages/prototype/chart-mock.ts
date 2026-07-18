/**
 * PROTOTYPE — throwaway mock series for chart UI exploration.
 * Question: What should site-wide Daily/Weekly/Monthly token charts look like?
 */

export type ChartPeriod = 'daily' | 'weekly' | 'monthly';
export type ChartMetric = 'input' | 'output' | 'cached' | 'cost';

export const CHART_PERIODS: readonly ChartPeriod[] = [
    'daily',
    'weekly',
    'monthly',
] as const;

export const CHART_METRICS: readonly ChartMetric[] = [
    'input',
    'output',
    'cached',
    'cost',
] as const;

export const PERIOD_LABELS: Record<ChartPeriod, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
};

export const METRIC_LABELS: Record<ChartMetric, string> = {
    input: 'Input',
    output: 'Output',
    cached: 'Cached',
    cost: 'Cost',
};

export const PERIOD_HINTS: Record<ChartPeriod, string> = {
    daily: 'One bar per day · last 30 days',
    weekly: 'One bar per week · last 12 weeks',
    monthly: 'One bar per month · last 12 months',
};

export interface ChartPoint {
    label: string;
    input: number;
    output: number;
    cached: number;
    cost: number; // cents-ish USD for display
}

/** Deterministic mock series so variants compare apples-to-apples. */
export function mockSeries(period: ChartPeriod): ChartPoint[] {
    const len = period === 'daily' ? 30 : 12;
    const points: ChartPoint[] = [];
    for (let i = 0; i < len; i++) {
        const wave = Math.sin(i / 2.4) * 0.35 + 1;
        const ramp = 0.55 + i / len;
        const base = (period === 'daily' ? 420_000 : 2_800_000) * wave * ramp;
        const input = Math.round(base * 0.55);
        const output = Math.round(base * 0.28);
        const cached = Math.round(base * 0.17);
        const cost =
            Math.round(((input * 3 + output * 15 + cached * 0.3) / 1e6) * 100) /
            100;
        const label =
            period === 'daily'
                ? `D${String(i + 1).padStart(2, '0')}`
                : period === 'weekly'
                  ? `W${i + 1}`
                  : `M${i + 1}`;
        points.push({ label, input, output, cached, cost });
    }
    return points;
}

export function metricValue(p: ChartPoint, metric: ChartMetric): number {
    return p[metric];
}

export function formatMetric(metric: ChartMetric, n: number): string {
    if (metric === 'cost') {
        return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return String(n);
}

export function seriesTotal(points: ChartPoint[], metric: ChartMetric): number {
    return points.reduce((acc, p) => acc + metricValue(p, metric), 0);
}

export function parsePeriod(v: string | undefined): ChartPeriod {
    if (v === 'weekly' || v === 'monthly' || v === 'daily') return v;
    return 'daily';
}

export function parseChartMetric(v: string | undefined): ChartMetric {
    if (v === 'output' || v === 'cached' || v === 'cost' || v === 'input')
        return v;
    return 'input';
}

/** Hot-linkable prototype URLs (period path + metric query). */
export function chartHref(
    variant: string,
    period: ChartPeriod,
    metric: ChartMetric,
): string {
    return `/?variant=${variant}&period=${period}&chartMetric=${metric}`;
}
