import { describe, expect, it } from 'vitest';
import type { Profile, ProfileWindowTotals } from '@/lib/aggregate';
import {
    buildShareCardPayload,
    buildShareCardSvg,
    escapeXml,
} from '@/lib/share-card';

const profile: Profile = {
    username: 'alice&bob',
    created_at: 1,
    rank: 3,
    sessions: 156,
    grand_total: 12_400_000,
    breakdown: [],
    url: null,
    country: 'AU',
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    reasoning_tokens: 0,
    cost: 842,
};

const last7d: ProfileWindowTotals = {
    grand_total: 1_800_000,
    cost: 96,
    sessions: 24,
};

describe('escapeXml', () => {
    it('escapes markup characters', () => {
        expect(escapeXml('a&b<c>"d"\'e')).toBe(
            'a&amp;b&lt;c&gt;&quot;d&quot;&apos;e',
        );
    });
});

describe('buildShareCardPayload', () => {
    it('formats 7d and all-time stats', () => {
        const payload = buildShareCardPayload(profile, last7d);
        expect(payload.username).toBe('alice&bob');
        expect(payload.rank).toBe('3');
        expect(payload.last7d).toEqual({
            tokens: '1.8M',
            cost: '$96.00',
            sessions: '24',
        });
        expect(payload.allTime).toEqual({
            tokens: '12M',
            cost: '$842.00',
            sessions: '156',
        });
    });
});

describe('buildShareCardSvg', () => {
    it('escapes username and includes both windows', () => {
        const svg = buildShareCardSvg(buildShareCardPayload(profile, last7d));
        expect(svg).toContain('alice&amp;bob');
        expect(svg).not.toContain('alice&bob');
        expect(svg).toContain('LAST 7 DAYS');
        expect(svg).toContain('ALL TIME');
        expect(svg).toContain('1.8M');
        expect(svg).toContain('12M');
        expect(svg).toContain('Rank #3');
    });
});
