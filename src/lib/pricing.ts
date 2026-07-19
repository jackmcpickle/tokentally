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
    'claude-opus-4': {
        input: 15,
        output: 75,
        cacheRead: 1.5,
        cacheWrite: 18.75,
    },
    'claude-sonnet-4': {
        input: 3,
        output: 15,
        cacheRead: 0.3,
        cacheWrite: 3.75,
    },
    'claude-sonnet-5': {
        input: 3,
        output: 15,
        cacheRead: 0.3,
        cacheWrite: 3.75,
    },
    'claude-haiku-4': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
    'claude-haiku': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
    'claude-3-5-sonnet': {
        input: 3,
        output: 15,
        cacheRead: 0.3,
        cacheWrite: 3.75,
    },
    'claude-3-5-haiku': {
        input: 0.8,
        output: 4,
        cacheRead: 0.08,
        cacheWrite: 1,
    },
    'claude-3-opus': {
        input: 15,
        output: 75,
        cacheRead: 1.5,
        cacheWrite: 18.75,
    },
    // OpenAI — Codex / GPT
    'gpt-5-codex': {
        input: 1.25,
        output: 10,
        cacheRead: 0.125,
        cacheWrite: 1.25,
    },
    'gpt-5-mini': {
        input: 0.25,
        output: 2,
        cacheRead: 0.025,
        cacheWrite: 0.25,
    },
    'gpt-5': { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25 },
    'o4-mini': { input: 1.1, output: 4.4, cacheRead: 0.275, cacheWrite: 1.1 },
    o3: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
    'gpt-4.1': { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
    'gpt-4o': { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 2.5 },

    // Google — Gemini (opencode/pi route here often; estimates)
    'gemini-2.5-pro': {
        input: 1.25,
        output: 10,
        cacheRead: 0.31,
        cacheWrite: 1.625,
    },
    'gemini-2.5-flash-lite': {
        input: 0.1,
        output: 0.4,
        cacheRead: 0.025,
        cacheWrite: 0.1,
    },
    'gemini-2.5-flash': {
        input: 0.3,
        output: 2.5,
        cacheRead: 0.075,
        cacheWrite: 0.3,
    },
    'gemini-2.0-flash': {
        input: 0.1,
        output: 0.4,
        cacheRead: 0.025,
        cacheWrite: 0.1,
    },
    'gemini-1.5-pro': {
        input: 1.25,
        output: 5,
        cacheRead: 0.3125,
        cacheWrite: 1.25,
    },
    'gemini-1.5-flash': {
        input: 0.075,
        output: 0.3,
        cacheRead: 0.019,
        cacheWrite: 0.075,
    },
    gemini: { input: 0.3, output: 2.5, cacheRead: 0.075, cacheWrite: 0.3 },

    // ---- Open-weight models via OpenRouter (rough per-1M estimates) ----
    // DeepSeek
    'deepseek-r1': {
        input: 0.55,
        output: 2.19,
        cacheRead: 0.14,
        cacheWrite: 0.55,
    },
    'deepseek-chat': {
        input: 0.28,
        output: 0.88,
        cacheRead: 0.03,
        cacheWrite: 0.28,
    },
    'deepseek-v3': {
        input: 0.27,
        output: 1.1,
        cacheRead: 0.07,
        cacheWrite: 0.27,
    },
    deepseek: { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: 0.27 },
    // Qwen
    'qwen3-coder': { input: 0.3, output: 1.2, cacheRead: 0.3, cacheWrite: 0.3 },
    'qwen-3-coder': {
        input: 0.3,
        output: 1.2,
        cacheRead: 0.3,
        cacheWrite: 0.3,
    },
    'qwen-2.5-coder': {
        input: 0.15,
        output: 0.15,
        cacheRead: 0.15,
        cacheWrite: 0.15,
    },
    'qwen-2.5': { input: 0.4, output: 0.4, cacheRead: 0.4, cacheWrite: 0.4 },
    qwen3: { input: 0.2, output: 0.85, cacheRead: 0.2, cacheWrite: 0.2 },
    qwq: { input: 0.15, output: 0.45, cacheRead: 0.15, cacheWrite: 0.15 },
    qwen: { input: 0.35, output: 0.4, cacheRead: 0.35, cacheWrite: 0.35 },
    // Meta Llama
    'llama-4-maverick': {
        input: 0.2,
        output: 0.85,
        cacheRead: 0.2,
        cacheWrite: 0.2,
    },
    'llama-4-scout': {
        input: 0.11,
        output: 0.34,
        cacheRead: 0.11,
        cacheWrite: 0.11,
    },
    'llama-3.3': {
        input: 0.13,
        output: 0.39,
        cacheRead: 0.13,
        cacheWrite: 0.13,
    },
    'llama-3.1-405b': {
        input: 0.8,
        output: 0.8,
        cacheRead: 0.8,
        cacheWrite: 0.8,
    },
    'llama-3.1': {
        input: 0.13,
        output: 0.39,
        cacheRead: 0.13,
        cacheWrite: 0.13,
    },
    'llama-3': { input: 0.13, output: 0.39, cacheRead: 0.13, cacheWrite: 0.13 },
    llama: { input: 0.2, output: 0.4, cacheRead: 0.2, cacheWrite: 0.2 },
    // Mistral
    'mistral-large': { input: 2, output: 6, cacheRead: 2, cacheWrite: 2 },
    'mistral-medium': {
        input: 0.4,
        output: 2,
        cacheRead: 0.4,
        cacheWrite: 0.4,
    },
    'mistral-small': {
        input: 0.2,
        output: 0.6,
        cacheRead: 0.2,
        cacheWrite: 0.2,
    },
    codestral: { input: 0.3, output: 0.9, cacheRead: 0.3, cacheWrite: 0.3 },
    'mixtral-8x22b': {
        input: 0.9,
        output: 0.9,
        cacheRead: 0.9,
        cacheWrite: 0.9,
    },
    'mixtral-8x7b': {
        input: 0.24,
        output: 0.24,
        cacheRead: 0.24,
        cacheWrite: 0.24,
    },
    mixtral: { input: 0.24, output: 0.24, cacheRead: 0.24, cacheWrite: 0.24 },
    magistral: { input: 0.5, output: 1.5, cacheRead: 0.5, cacheWrite: 0.5 },
    devstral: { input: 0.1, output: 0.3, cacheRead: 0.1, cacheWrite: 0.1 },
    ministral: { input: 0.1, output: 0.1, cacheRead: 0.1, cacheWrite: 0.1 },
    pixtral: { input: 0.15, output: 0.15, cacheRead: 0.15, cacheWrite: 0.15 },
    mistral: { input: 0.2, output: 0.6, cacheRead: 0.2, cacheWrite: 0.2 },
    // Moonshot Kimi
    'kimi-k2': { input: 0.55, output: 2.2, cacheRead: 0.15, cacheWrite: 0.55 },
    kimi: { input: 0.55, output: 2.2, cacheRead: 0.15, cacheWrite: 0.55 },
    // Zhipu GLM
    'glm-4.6': { input: 0.6, output: 2.2, cacheRead: 0.11, cacheWrite: 0.6 },
    'glm-4.5-air': {
        input: 0.2,
        output: 1.1,
        cacheRead: 0.03,
        cacheWrite: 0.2,
    },
    'glm-4.5': { input: 0.6, output: 2.2, cacheRead: 0.11, cacheWrite: 0.6 },
    'glm-4': { input: 0.6, output: 2.2, cacheRead: 0.11, cacheWrite: 0.6 },
    glm: { input: 0.6, output: 2.2, cacheRead: 0.11, cacheWrite: 0.6 },
    // Google Gemma
    'gemma-3': { input: 0.1, output: 0.2, cacheRead: 0.1, cacheWrite: 0.1 },
    'gemma-2': { input: 0.27, output: 0.27, cacheRead: 0.27, cacheWrite: 0.27 },
    gemma: { input: 0.1, output: 0.2, cacheRead: 0.1, cacheWrite: 0.1 },
    // MiniMax
    'minimax-m2': { input: 0.3, output: 1.2, cacheRead: 0.3, cacheWrite: 0.3 },
    'minimax-m1': {
        input: 0.55,
        output: 2.2,
        cacheRead: 0.55,
        cacheWrite: 0.55,
    },
    minimax: { input: 0.3, output: 1.2, cacheRead: 0.3, cacheWrite: 0.3 },
};

// Conservative fallback so unknown models still contribute a plausible estimate.
const FALLBACK: ModelPrice = {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
};

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
