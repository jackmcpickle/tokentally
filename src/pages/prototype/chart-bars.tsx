import type { FC } from 'hono/jsx';
import {
    type ChartMetric,
    type ChartPoint,
    formatMetric,
    metricValue,
} from '@/pages/prototype/chart-mock';

/** Shared CSS bar chart — stands in for shadcn/Recharts in this throwaway. */
export const PrototypeBars: FC<{
    points: ChartPoint[];
    metric: ChartMetric;
    height?: number;
}> = ({ points, metric, height = 220 }) => {
    const values = points.map((p) => metricValue(p, metric));
    const max = Math.max(...values, 1);
    return (
        <div
            class="flex items-end gap-px sm:gap-0.5"
            style={`height:${height}px`}
            role="img"
            aria-label={`${metric} chart`}
        >
            {points.map((p, i) => {
                const v = values[i]!;
                const pct = Math.max(4, Math.round((v / max) * 100));
                return (
                    <div
                        key={p.label}
                        class="group relative flex min-w-0 flex-1 flex-col justify-end"
                        title={`${p.label}: ${formatMetric(metric, v)}`}
                    >
                        <div
                            class="w-full rounded-t-sm bg-text transition-[filter] group-hover:brightness-125"
                            style={`height:${pct}%`}
                        />
                    </div>
                );
            })}
        </div>
    );
};

export const PrototypeAxis: FC<{ points: ChartPoint[] }> = ({ points }) => {
    const step = points.length > 16 ? 5 : points.length > 8 ? 2 : 1;
    return (
        <div class="mt-2 flex justify-between text-[10px] text-muted tabular-nums">
            {points.map((p, i) => (
                <span
                    key={p.label}
                    class="min-w-0 flex-1 overflow-hidden text-center"
                    style={i % step === 0 ? undefined : 'visibility:hidden'}
                >
                    {p.label}
                </span>
            ))}
        </div>
    );
};
