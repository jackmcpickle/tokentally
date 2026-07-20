import type { JsonObject, ReporterTotals, TotalsKey } from './types';

export function emptyTotals(): ReporterTotals {
    return {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        reasoning_tokens: 0,
    };
}

export function num(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0
        ? Math.floor(v)
        : 0;
}

function firstNum(obj: JsonObject, keys: string | readonly string[]): number {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
        const value = obj[key];
        if (value !== undefined && value !== null) return num(value);
    }
    return 0;
}

export function usageFromFields(
    obj: JsonObject,
    fields: {
        input: string | readonly string[];
        output: string | readonly string[];
        cache_read: string | readonly string[];
        cache_creation: string | readonly string[];
        reasoning?: string | readonly string[];
    },
): ReporterTotals {
    return {
        input_tokens: firstNum(obj, fields.input),
        output_tokens: firstNum(obj, fields.output),
        cache_read_tokens: firstNum(obj, fields.cache_read),
        cache_creation_tokens: firstNum(obj, fields.cache_creation),
        reasoning_tokens: fields.reasoning
            ? firstNum(obj, fields.reasoning)
            : 0,
    };
}

export function addUsage(target: ReporterTotals, usage: ReporterTotals): void {
    for (const key of Object.keys(usage) as TotalsKey[]) {
        target[key] += usage[key];
    }
}

export function accumulateModelUsage(
    models: Map<string, ReporterTotals>,
    model: string,
    usage: ReporterTotals,
): void {
    const t = models.get(model) ?? emptyTotals();
    addUsage(t, usage);
    models.set(model, t);
}
