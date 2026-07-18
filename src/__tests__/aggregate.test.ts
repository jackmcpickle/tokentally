import { describe, expect, it } from 'vitest';
import { grandTotal, metricValue, windowStart, type Totals } from '@/lib/aggregate';

const T: Totals = {
    input_tokens: 100,
    output_tokens: 200,
    cache_read_tokens: 1000,
    cache_creation_tokens: 50,
    reasoning_tokens: 10,
    cost: 4.2,
};

describe('windowStart', () => {
    const now = Date.parse('2026-07-18T13:30:00Z');

    it('all-time starts at 0', () => {
        expect(windowStart('all', now)).toBe(0);
    });
    it('today starts at UTC midnight', () => {
        expect(windowStart('today', now)).toBe(Date.parse('2026-07-18T00:00:00Z'));
    });
    it('7d and 30d subtract the right span', () => {
        expect(windowStart('7d', now)).toBe(now - 7 * 86_400_000);
        expect(windowStart('30d', now)).toBe(now - 30 * 86_400_000);
    });
});

describe('metricValue', () => {
    it('grand total sums every token category', () => {
        expect(grandTotal(T)).toBe(1360);
        expect(metricValue(T, 'total')).toBe(1360);
    });
    it('io is input + output', () => {
        expect(metricValue(T, 'io')).toBe(300);
    });
    it('output is output only', () => {
        expect(metricValue(T, 'output')).toBe(200);
    });
    it('cost is the estimated dollars', () => {
        expect(metricValue(T, 'cost')).toBe(4.2);
    });
});
