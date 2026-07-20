import { describe, expect, it } from 'vitest';
import {
    isSyntheticModel,
    sessionIdFromPath,
    toRows,
} from '../../reporter/src/lib/rows';
import { emptyTotals } from '../../reporter/src/lib/totals';

describe('reporter shared rows helpers', () => {
    it('sessionIdFromPath strips .jsonl and rollout- prefix', () => {
        expect(sessionIdFromPath('/tmp/rollout-2026-07-18-abc.jsonl')).toBe(
            '2026-07-18-abc',
        );
        expect(sessionIdFromPath('sess-1.jsonl')).toBe('sess-1');
    });

    it('isSyntheticModel treats angle-bracket synthetic labels as synthetic', () => {
        expect(isSyntheticModel('<synthetic>')).toBe(true);
        expect(isSyntheticModel('synthetic')).toBe(true);
        expect(isSyntheticModel('claude-opus')).toBe(false);
        expect(isSyntheticModel(1)).toBe(false);
    });

    it('toRows emits one API row per non-synthetic model', () => {
        const models = new Map([
            [
                'claude-opus',
                {
                    ...emptyTotals(),
                    input_tokens: 10,
                    output_tokens: 20,
                },
            ],
            ['<synthetic>', emptyTotals()],
        ]);
        const rows = toRows(
            {
                session_id: 'sess-1',
                started_at: 1_000,
                models,
            },
            '/unused.jsonl',
        );
        expect(rows).toEqual([
            {
                session_id: 'sess-1',
                model: 'claude-opus',
                started_at: 1_000,
                input_tokens: 10,
                output_tokens: 20,
                cache_read_tokens: 0,
                cache_creation_tokens: 0,
                reasoning_tokens: 0,
            },
        ]);
    });

    it('toRows falls back to path-derived session id and Date.now when missing', () => {
        const before = Date.now();
        const rows = toRows(
            {
                session_id: null,
                started_at: null,
                models: new Map([['m', emptyTotals()]]),
            },
            '/tmp/rollout-fallback-id.jsonl',
        );
        const after = Date.now();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.session_id).toBe('fallback-id');
        expect(rows[0]?.started_at).toBeGreaterThanOrEqual(before);
        expect(rows[0]?.started_at).toBeLessThanOrEqual(after);
    });
});
