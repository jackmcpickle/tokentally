import { describe, expect, it } from 'vitest';
import { estimateCost, priceFor } from '@/lib/pricing';

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
});
