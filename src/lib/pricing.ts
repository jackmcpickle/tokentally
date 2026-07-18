/**
 * Per-model pricing, USD per 1,000,000 tokens. These are ESTIMATES used only to
 * show an approximate spend on the board — update them by editing this file and
 * redeploying. Matching is by longest case-insensitive substring of the model id,
 * so `claude-opus-4-8-20260101` matches the `claude-opus-4` entry.
 */
export interface ModelPrice {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
}

const PRICES: Record<string, ModelPrice> = {
    // Anthropic — Claude
    'claude-opus-4': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    'claude-sonnet-4': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    'claude-sonnet-5': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    'claude-haiku-4': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
    'claude-haiku': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
    'claude-3-5-sonnet': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    'claude-3-5-haiku': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
    'claude-3-opus': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    // OpenAI — Codex / GPT
    'gpt-5-codex': { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25 },
    'gpt-5-mini': { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0.25 },
    'gpt-5': { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25 },
    'o4-mini': { input: 1.1, output: 4.4, cacheRead: 0.275, cacheWrite: 1.1 },
    'o3': { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
    'gpt-4.1': { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
    'gpt-4o': { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 2.5 },
};

// Conservative fallback so unknown models still contribute a plausible estimate.
const FALLBACK: ModelPrice = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };

export function priceFor(model: string): ModelPrice {
    const m = model.toLowerCase();
    let best: ModelPrice | null = null;
    let bestLen = 0;
    for (const key in PRICES) {
        if (m.includes(key) && key.length > bestLen) {
            best = PRICES[key] ?? null;
            bestLen = key.length;
        }
    }
    return best ?? FALLBACK;
}

export interface TokenCounts {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
}

/** Estimated USD cost for one model's token counts. */
export function estimateCost(model: string, t: TokenCounts): number {
    const p = priceFor(model);
    return (
        (t.input_tokens * p.input +
            t.output_tokens * p.output +
            t.cache_read_tokens * p.cacheRead +
            t.cache_creation_tokens * p.cacheWrite) /
        1_000_000
    );
}
