import { describe, expect, it } from 'vitest';
import {
    MAX_HISTORY_SESSIONS,
    MAX_INGEST_SESSIONS,
    parseHistoryBody,
    parseIngestBody,
    validateProfileUrl,
    validateUsername,
} from '@/lib/validate';
import { isSource } from '@/types';

describe('validateUsername', () => {
    it('accepts valid handles', () => {
        expect(validateUsername('tokenlord')).toEqual({
            ok: true,
            value: 'tokenlord',
        });
        expect(validateUsername('a_b-1')).toEqual({ ok: true, value: 'a_b-1' });
    });
    it('rejects bad shapes', () => {
        expect(validateUsername('x').ok).toBe(false);
        expect(validateUsername('has space').ok).toBe(false);
        expect(validateUsername('a'.repeat(33)).ok).toBe(false);
        expect(validateUsername(42).ok).toBe(false);
    });
    it('rejects reserved names case-insensitively', () => {
        expect(validateUsername('API').ok).toBe(false);
        expect(validateUsername('admin').ok).toBe(false);
        expect(validateUsername('pricing').ok).toBe(false);
        expect(validateUsername('tokenmaxer').ok).toBe(false);
        expect(validateUsername('TokenTally').ok).toBe(false);
    });
});

describe('parseIngestBody', () => {
    const good = {
        source: 'claude_code',
        sessions: [
            {
                session_id: 's1',
                model: 'claude-opus-4-8',
                started_at: 1_700_000_000_000,
                input_tokens: 10,
                output_tokens: 20,
                cache_read_tokens: 5,
                cache_creation_tokens: 1,
                reasoning_tokens: 0,
            },
        ],
    };

    it('accepts a well-formed payload', () => {
        const r = parseIngestBody(good);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.sessions[0]?.input_tokens).toBe(10);
    });

    it('rejects unknown source', () => {
        expect(parseIngestBody({ ...good, source: 'nope' }).ok).toBe(false);
    });
    it('accepts all supported sources', () => {
        for (const source of [
            'claude_code',
            'codex',
            'opencode',
            'pi',
            'cursor',
        ]) {
            const r = parseIngestBody({ ...good, source });
            expect(r.ok).toBe(true);
            if (r.ok) expect(r.value.source).toBe(source);
        }
    });
    it('accepts cursor source', () => {
        expect(parseIngestBody({ source: 'cursor', sessions: [] }).ok).toBe(
            false,
        ); // empty sessions still rejected
        expect(isSource('cursor')).toBe(true);
    });
    it('rejects empty sessions', () => {
        expect(parseIngestBody({ source: 'codex', sessions: [] }).ok).toBe(
            false,
        );
    });
    it('coerces negative/NaN counts to 0', () => {
        const r = parseIngestBody({
            source: 'codex',
            sessions: [
                {
                    session_id: 's',
                    model: 'm',
                    input_tokens: -5,
                    output_tokens: 'x',
                },
            ],
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.sessions[0]?.input_tokens).toBe(0);
            expect(r.value.sessions[0]?.output_tokens).toBe(0);
        }
    });
    it('rejects implausible token counts', () => {
        const r = parseIngestBody({
            source: 'codex',
            sessions: [
                { session_id: 's', model: 'm', input_tokens: 5_000_000_000 },
            ],
        });
        expect(r.ok).toBe(false);
    });
    it('requires session_id and model', () => {
        expect(
            parseIngestBody({ source: 'codex', sessions: [{ model: 'm' }] }).ok,
        ).toBe(false);
        expect(
            parseIngestBody({
                source: 'codex',
                sessions: [{ session_id: 's' }],
            }).ok,
        ).toBe(false);
    });

    it('drops synthetic model sessions', () => {
        const r = parseIngestBody({
            source: 'claude_code',
            sessions: [
                {
                    session_id: 's1',
                    model: 'claude-sonnet-5',
                    input_tokens: 10,
                    output_tokens: 20,
                },
                {
                    session_id: 's2',
                    model: '<synthetic>',
                    input_tokens: 0,
                    output_tokens: 0,
                },
            ],
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.sessions).toHaveLength(1);
            expect(r.value.sessions[0]?.model).toBe('claude-sonnet-5');
        }
    });

    it('accepts an all-synthetic payload as an empty session list', () => {
        const r = parseIngestBody({
            source: 'claude_code',
            sessions: [
                {
                    session_id: 's2',
                    model: '<synthetic>',
                    input_tokens: 0,
                    output_tokens: 0,
                },
            ],
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.sessions).toEqual([]);
    });

    it('caps ingest at MAX_INGEST_SESSIONS', () => {
        const many = Array.from(
            { length: MAX_INGEST_SESSIONS + 1 },
            (_, i) => ({
                session_id: `s${i}`,
                model: 'm',
            }),
        );
        expect(parseIngestBody({ source: 'codex', sessions: many }).ok).toBe(
            false,
        );
    });
});

describe('parseHistoryBody', () => {
    function many(n: number) {
        return Array.from({ length: n }, (_, i) => ({
            session_id: `s${i}`,
            model: 'm',
        }));
    }

    it('accepts more sessions than the ingest cap', () => {
        const r = parseHistoryBody({
            source: 'claude_code',
            sessions: many(MAX_INGEST_SESSIONS + 1),
        });
        expect(r.ok).toBe(true);
    });

    it('accepts exactly the history cap', () => {
        const r = parseHistoryBody({
            source: 'claude_code',
            sessions: many(MAX_HISTORY_SESSIONS),
        });
        expect(r.ok).toBe(true);
    });

    it('rejects beyond the history cap', () => {
        const r = parseHistoryBody({
            source: 'claude_code',
            sessions: many(MAX_HISTORY_SESSIONS + 1),
        });
        expect(r.ok).toBe(false);
    });

    it('applies the same per-session validation', () => {
        expect(parseHistoryBody({ source: 'nope', sessions: many(1) }).ok).toBe(
            false,
        );
        expect(
            parseHistoryBody({ source: 'codex', sessions: [{ model: 'm' }] })
                .ok,
        ).toBe(false);
    });
});

describe('validateProfileUrl', () => {
    it('accepts https URLs and returns href', () => {
        expect(validateProfileUrl('https://example.com/me')).toEqual({
            ok: true,
            value: 'https://example.com/me',
        });
    });

    it('trims whitespace', () => {
        expect(validateProfileUrl('  https://example.com/x  ')).toEqual({
            ok: true,
            value: 'https://example.com/x',
        });
    });

    it('clears on null or empty string', () => {
        expect(validateProfileUrl(null)).toEqual({ ok: true, value: null });
        expect(validateProfileUrl('')).toEqual({ ok: true, value: null });
        expect(validateProfileUrl('   ')).toEqual({ ok: true, value: null });
    });

    it('rejects http, javascript, relative, and non-strings', () => {
        expect(validateProfileUrl('http://example.com').ok).toBe(false);
        expect(validateProfileUrl('javascript:alert(1)').ok).toBe(false);
        expect(validateProfileUrl('/relative').ok).toBe(false);
        expect(validateProfileUrl('example.com').ok).toBe(false);
        expect(validateProfileUrl(42).ok).toBe(false);
    });

    it('rejects URLs with credentials', () => {
        expect(validateProfileUrl('https://user:pass@example.com').ok).toBe(
            false,
        );
    });

    it('rejects overlong URLs', () => {
        const long = `https://example.com/${'a'.repeat(2048)}`;
        expect(validateProfileUrl(long).ok).toBe(false);
    });
});
