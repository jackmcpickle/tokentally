import { describe, expect, it } from 'vitest';
import {
    asObject,
    jsonlObjects,
    toMs,
} from '../../reporter/src/lib/parse-utils';
import {
    accumulateModelUsage,
    addUsage,
    emptyTotals,
    num,
    usageFromFields,
} from '../../reporter/src/lib/totals';

describe('reporter shared totals helpers', () => {
    it('emptyTotals returns zeroed canonical counters', () => {
        expect(emptyTotals()).toEqual({
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            reasoning_tokens: 0,
        });
    });

    it('num floors positive finite numbers and rejects the rest', () => {
        expect(num(3.7)).toBe(3);
        expect(num(0)).toBe(0);
        expect(num(-1)).toBe(0);
        expect(num('9')).toBe(0);
        expect(num(Number.NaN)).toBe(0);
    });

    it('usageFromFields maps aliased provider fields into canonical totals', () => {
        // Claude-style
        expect(
            usageFromFields(
                {
                    input_tokens: 100,
                    output_tokens: 200,
                    cache_read_input_tokens: 50,
                    cache_creation_input_tokens: 5,
                },
                {
                    input: 'input_tokens',
                    output: 'output_tokens',
                    cache_read: 'cache_read_input_tokens',
                    cache_creation: 'cache_creation_input_tokens',
                },
            ),
        ).toEqual({
            input_tokens: 100,
            output_tokens: 200,
            cache_read_tokens: 50,
            cache_creation_tokens: 5,
            reasoning_tokens: 0,
        });

        // Cursor-style camelCase + first matching alias wins
        expect(
            usageFromFields(
                { inputTokens: 10, outputTokens: 20, cacheReadTokens: 3 },
                {
                    input: ['inputTokens', 'input_tokens'],
                    output: ['outputTokens', 'output_tokens'],
                    cache_read: ['cacheReadTokens', 'cache_read_tokens'],
                    cache_creation: [
                        'cacheWriteTokens',
                        'cache_creation_tokens',
                    ],
                    reasoning: ['reasoning_tokens'],
                },
            ),
        ).toEqual({
            input_tokens: 10,
            output_tokens: 20,
            cache_read_tokens: 3,
            cache_creation_tokens: 0,
            reasoning_tokens: 0,
        });
    });

    it('addUsage mutates target by summing canonical fields', () => {
        const target = emptyTotals();
        addUsage(target, {
            input_tokens: 1,
            output_tokens: 2,
            cache_read_tokens: 3,
            cache_creation_tokens: 4,
            reasoning_tokens: 5,
        });
        addUsage(target, {
            input_tokens: 10,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            reasoning_tokens: 0,
        });
        expect(target).toEqual({
            input_tokens: 11,
            output_tokens: 2,
            cache_read_tokens: 3,
            cache_creation_tokens: 4,
            reasoning_tokens: 5,
        });
    });

    it('accumulateModelUsage upserts per-model totals in a map', () => {
        const models = new Map();
        accumulateModelUsage(
            models,
            'claude-opus',
            usageFromFields(
                { input_tokens: 5, output_tokens: 7 },
                {
                    input: 'input_tokens',
                    output: 'output_tokens',
                    cache_read: 'cache_read_tokens',
                    cache_creation: 'cache_creation_tokens',
                },
            ),
        );
        accumulateModelUsage(
            models,
            'claude-opus',
            usageFromFields(
                { input_tokens: 1, output_tokens: 2 },
                {
                    input: 'input_tokens',
                    output: 'output_tokens',
                    cache_read: 'cache_read_tokens',
                    cache_creation: 'cache_creation_tokens',
                },
            ),
        );
        accumulateModelUsage(
            models,
            'other',
            usageFromFields(
                { input_tokens: 9, output_tokens: 1 },
                {
                    input: 'input_tokens',
                    output: 'output_tokens',
                    cache_read: 'cache_read_tokens',
                    cache_creation: 'cache_creation_tokens',
                },
            ),
        );
        expect(models.get('claude-opus')).toEqual({
            input_tokens: 6,
            output_tokens: 9,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            reasoning_tokens: 0,
        });
        expect(models.get('other')?.input_tokens).toBe(9);
    });
});

describe('reporter shared parse utils', () => {
    it('asObject returns {} for non-objects and the object otherwise', () => {
        expect(asObject(null)).toEqual({});
        expect(asObject(undefined)).toEqual({});
        expect(asObject('x')).toEqual({});
        expect(asObject({ a: 1 })).toEqual({ a: 1 });
    });

    it('toMs parses ISO strings and rejects other values', () => {
        expect(toMs('2026-07-18T10:00:00Z')).toBe(
            Date.parse('2026-07-18T10:00:00Z'),
        );
        expect(toMs(123)).toBeNull();
        expect(toMs('not-a-date')).toBeNull();
    });

    it('jsonlObjects yields objects and skips blanks/bad lines', () => {
        const text = [
            '',
            '{"a":1}',
            'not json',
            '{"b":2}',
            '   ',
            'null',
            '"string"',
        ].join('\n');
        expect([...jsonlObjects(text)]).toEqual([{ a: 1 }, { b: 2 }]);
    });
});
