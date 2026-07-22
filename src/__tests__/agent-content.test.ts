import { describe, expect, it } from 'vitest';
import { aboutMarkdown } from '@/content/about.md';
import { homeMarkdown } from '@/content/home.md';
import { llmsTxt } from '@/content/llms';
import { llmsFullTxt } from '@/content/llms-full';
import { pricingMarkdown } from '@/content/pricing.md';
import { profileMarkdown, profileNotFoundMarkdown } from '@/content/profile.md';
import { startMarkdown } from '@/content/start.md';
import type { LeaderboardEntry, Profile } from '@/lib/aggregate';
import { formatTokens, formatUsd } from '@/lib/format';

describe('aboutMarkdown', () => {
    it('has title and core sections', () => {
        const md = aboutMarkdown();
        expect(md).toMatch(/^# About tokenmaxer\.quest/mu);
        expect(md).toContain('## What it tracks');
        expect(md).toContain('## Where the numbers come from');
        expect(md).toContain('## The honest part');
        expect(md).toContain('## Accounts & privacy');
        expect(md).toContain('Claude Code');
        expect(md).toContain('Cursor');
        expect(md).toContain('/api/profile');
    });
});

describe('pricingMarkdown', () => {
    it('lists reference rates as a table', () => {
        const md = pricingMarkdown();
        expect(md).toMatch(/^# Reference pricing/mu);
        expect(md).toContain('| Model id |');
        expect(md).toContain('`claude-sonnet-5`');
        expect(md).toContain('1,000,000');
    });
});

describe('startMarkdown', () => {
    it('includes setup placeholders and tool sections', () => {
        const md = startMarkdown('https://tokenmaxer.quest');
        expect(md).toMatch(/^# Get started/mu);
        expect(md).toContain('YOUR_USERNAME');
        expect(md).toContain('YOUR_TOKEN');
        expect(md).toContain('npm install -g tokenmaxer');
        expect(md).toContain('~/.tokenmaxer/config.json');
        expect(md).not.toContain('~/.tokentally');
        expect(md).toContain('## What leaves your machine');
        expect(md).toContain('--dry-run');
        expect(md).toContain('## Agent prompt');
        expect(md).toContain('## Claude Code');
        expect(md).toContain('## Codex');
        expect(md).toContain('## opencode');
        expect(md).toContain('## pi');
        expect(md).toContain('## Cursor');
        expect(md).toContain('POST /api/register');
        expect(md).toContain('"url"');
        expect(md).toContain('set-profile-url');
    });
});

describe('llmsTxt', () => {
    it('matches llms.txt shape with absolute .md and API links', () => {
        const md = llmsTxt('https://tokenmaxer.quest');
        expect(md).toMatch(/^# tokenmaxer\.quest/mu);
        expect(md).toMatch(/^>/mu);
        expect(md).toContain('## Docs');
        expect(md).toContain('## API');
        expect(md).toContain(
            '[Leaderboard](https://tokenmaxer.quest/index.md)',
        );
        expect(md).toContain('[About](https://tokenmaxer.quest/about.md)');
        expect(md).toContain('[Pricing](https://tokenmaxer.quest/pricing.md)');
        expect(md).toContain(
            '[Get started](https://tokenmaxer.quest/start.md)',
        );
        expect(md).toContain('https://tokenmaxer.quest/api/leaderboard');
        expect(md).toContain('https://tokenmaxer.quest/api/u/:username');
        expect(md).toContain('https://tokenmaxer.quest/api/profile');
        expect(md).toContain('## Optional');
    });
});

describe('llmsFullTxt', () => {
    it('inlines about + pricing + start and stays under 50KB', () => {
        const md = llmsFullTxt('https://tokenmaxer.quest');
        expect(md).toContain('# About tokenmaxer.quest');
        expect(md).toContain('# Reference pricing');
        expect(md).toContain('# Get started');
        expect(md).toContain('/index.md');
        expect(md).toContain('https://tokenmaxer.quest/api/profile');
        expect(md.length).toBeLessThan(50_000);
    });
});

const fixtureEntry: LeaderboardEntry = {
    rank: 1,
    username: 'alice',
    sessions: 12,
    input_tokens: 120_000,
    output_tokens: 45_000,
    cache_read_tokens: 30_000,
    cache_creation_tokens: 5_000,
    reasoning_tokens: 8_000,
    cost: 12.34,
    grand_total: 208_000,
};

describe('homeMarkdown', () => {
    it('mentions top 10 / 7 days by default and lists table columns', () => {
        const md = homeMarkdown({
            base: 'https://tokenmaxer.quest',
            entries: [fixtureEntry],
            window: '7d',
        });
        expect(md).toMatch(/top 10/iu);
        expect(md).toMatch(/7 days/iu);
        expect(md).toContain('| Rank |');
        for (const col of [
            'Rank',
            'Username',
            'Sessions',
            'Input',
            'Output',
            'Cache read',
            'Cache write',
            'Reasoning',
            'Total',
            'Est. cost',
        ]) {
            expect(md).toContain(col);
        }
        expect(md).toContain('alice');
        expect(md).toContain(formatTokens(fixtureEntry.input_tokens));
        expect(md).toContain(formatUsd(fixtureEntry.cost));
        expect(md).toContain('https://tokenmaxer.quest/api/leaderboard');
    });

    it('mentions the active window when 30d is passed', () => {
        const md = homeMarkdown({
            base: 'https://tokenmaxer.quest',
            entries: [fixtureEntry],
            window: '30d',
        });
        expect(md).toMatch(/30d|30 days/iu);
    });

    it('shows a "no entries yet" note with an empty leaderboard', () => {
        const md = homeMarkdown({
            base: 'https://tokenmaxer.quest',
            entries: [],
            window: '7d',
        });
        expect(md).toContain('| Rank |');
        expect(md).toMatch(/no entries yet/iu);
    });

    it('lists active source and model filters when provided', () => {
        const md = homeMarkdown({
            base: 'https://tokenmaxer.quest',
            entries: [fixtureEntry],
            window: 'today',
            source: 'claude_code',
            model: 'sonnet',
        });
        expect(md).toContain('Claude Code');
        expect(md).toContain('sonnet');
    });
});

const fixtureProfile: Profile = {
    username: 'bob',
    created_at: Date.UTC(2026, 0, 1),
    rank: 3,
    sessions: 20,
    url: null,
    country: 'AU',
    grand_total: 500_000,
    input_tokens: 300_000,
    output_tokens: 150_000,
    cache_read_tokens: 40_000,
    cache_creation_tokens: 8_000,
    reasoning_tokens: 2_000,
    cost: 45.6,
    breakdown: [
        {
            source: 'claude_code',
            model: 'claude-sonnet-4-6',
            input_tokens: 300_000,
            output_tokens: 150_000,
            cache_read_tokens: 40_000,
            cache_creation_tokens: 8_000,
            reasoning_tokens: 2_000,
            cost: 45.6,
        },
    ],
};

describe('profileMarkdown', () => {
    it('includes username, rank, totals, and a breakdown model row', () => {
        const md = profileMarkdown({
            base: 'https://tokenmaxer.quest',
            profile: fixtureProfile,
        });
        expect(md).toMatch(/^# bob/mu);
        expect(md).toContain('Rank #3');
        expect(md).toContain(formatTokens(fixtureProfile.grand_total));
        expect(md).toContain(formatUsd(fixtureProfile.cost));
        expect(md).toContain('## By model');
        expect(md).toContain('Claude Code');
        expect(md).toContain('claude-sonnet-4-6');
        expect(md).toContain('https://tokenmaxer.quest/llms.txt');
        expect(md).toContain('https://tokenmaxer.quest/api/u/bob');
    });

    it('shows a "no usage" note for an empty breakdown', () => {
        const md = profileMarkdown({
            base: 'https://tokenmaxer.quest',
            profile: { ...fixtureProfile, breakdown: [] },
        });
        expect(md).toMatch(/no usage/iu);
    });

    it('includes a markdown link when profile.url is set', () => {
        const md = profileMarkdown({
            base: 'https://tokenmaxer.quest',
            profile: { ...fixtureProfile, url: 'https://example.com/bob' },
        });
        expect(md).toContain(
            '[https://example.com/bob](https://example.com/bob)',
        );
    });
});

describe('profileNotFoundMarkdown', () => {
    it('mentions not found and the requested username', () => {
        const md = profileNotFoundMarkdown('nope');
        expect(md).toMatch(/not found/iu);
        expect(md).toContain('nope');
    });
});
