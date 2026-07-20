import { describe, expect, it } from 'vitest';
import { estimateCost, listPrices, priceFor } from '@/lib/pricing';

describe('priceFor', () => {
    it('matches the longest substring for versioned model ids', () => {
        expect(priceFor('claude-opus-4-8-20260101').output).toBe(75);
        expect(priceFor('claude-sonnet-5-20260101').output).toBe(15);
        expect(priceFor('gpt-5-codex').input).toBe(1.25);
    });

    it('falls back for unknown models', () => {
        const p = priceFor('some-unknown-model');
        expect(p.input).toBeGreaterThan(0);
        expect(p.output).toBeGreaterThan(0);
    });

    it('prices open-weight models (opencode/pi) rather than falling back', () => {
        // Provider-prefixed ids (as opencode/OpenRouter emit them) still match.
        expect(priceFor('deepseek/deepseek-r1').output).toBe(2.19);
        expect(priceFor('moonshotai/kimi-k2').output).toBe(2.2);
        expect(priceFor('qwen/qwen3-coder').input).toBe(0.3);
        expect(priceFor('z-ai/glm-4.6').output).toBe(2.2);
        expect(priceFor('google/gemini-2.5-pro').output).toBe(10);
    });
});

describe('listPrices', () => {
    it('returns every priced model id sorted alphabetically', () => {
        const prices = listPrices();
        expect(prices.length).toBeGreaterThan(10);
        expect(prices.map((p) => p.id)).toEqual(
            [...prices.map((p) => p.id)].sort((a, b) => a.localeCompare(b)),
        );
        const sonnet = prices.find((p) => p.id === 'claude-sonnet-5');
        expect(sonnet).toEqual({
            id: 'claude-sonnet-5',
            input: 3,
            output: 15,
            cacheRead: 0.3,
            cacheWrite: 3.75,
        });
    });
});

describe('estimateCost', () => {
    it('computes USD from per-million pricing', () => {
        // 1M output tokens on opus @ $75/M = $75
        const cost = estimateCost('claude-opus-4-8', {
            input_tokens: 0,
            output_tokens: 1_000_000,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
        });
        expect(cost).toBeCloseTo(75, 5);
    });

    it('adds all categories', () => {
        const cost = estimateCost('claude-sonnet-5', {
            input_tokens: 1_000_000, // $3
            output_tokens: 1_000_000, // $15
            cache_read_tokens: 1_000_000, // $0.30
            cache_creation_tokens: 1_000_000, // $3.75
        });
        expect(cost).toBeCloseTo(22.05, 4);
    });

    it('claude_code source stays additive (cache buckets are distinct)', () => {
        const t = {
            input_tokens: 1_000_000,
            output_tokens: 1_000_000,
            cache_read_tokens: 1_000_000,
            cache_creation_tokens: 1_000_000,
        };
        expect(estimateCost('claude-sonnet-5', t, 'claude_code')).toBeCloseTo(
            estimateCost('claude-sonnet-5', t),
            8,
        );
    });

    it('codex source treats cached tokens as a subset of input', () => {
        // gpt-5: input $1.25/M, cacheRead $0.125/M, output $10/M.
        // input 1M includes 400k cached: 600k @ 1.25 + 400k @ 0.125 + 1M out.
        const cost = estimateCost(
            'gpt-5',
            {
                input_tokens: 1_000_000,
                output_tokens: 1_000_000,
                cache_read_tokens: 400_000,
                cache_creation_tokens: 0,
            },
            'codex',
        );
        expect(cost).toBeCloseTo(0.6 * 1.25 + 0.4 * 0.125 + 10, 6);
    });

    it('codex source clamps cached tokens to the input total', () => {
        // cached > input can only be bad data; never bill negative input.
        const cost = estimateCost(
            'gpt-5',
            {
                input_tokens: 100_000,
                output_tokens: 0,
                cache_read_tokens: 500_000,
                cache_creation_tokens: 0,
            },
            'codex',
        );
        expect(cost).toBeCloseTo(0.1 * 0.125, 6);
    });

    it('codex source clamps cache writes to the non-cached remainder', () => {
        // gpt-5 cacheWrite $1.25/M: 400k cached + 600k write fills input;
        // the extra 200k write must not be billed on top.
        const cost = estimateCost(
            'gpt-5',
            {
                input_tokens: 1_000_000,
                output_tokens: 0,
                cache_read_tokens: 400_000,
                cache_creation_tokens: 800_000,
            },
            'codex',
        );
        expect(cost).toBeCloseTo(0.4 * 0.125 + 0.6 * 1.25, 6);
    });

    it('pi source uses the same subset formula as codex', () => {
        const t = {
            input_tokens: 1_000_000,
            output_tokens: 0,
            cache_read_tokens: 1_000_000,
            cache_creation_tokens: 0,
        };
        expect(estimateCost('gpt-5', t, 'pi')).toBeCloseTo(
            estimateCost('gpt-5', t, 'codex'),
            8,
        );
    });
});
