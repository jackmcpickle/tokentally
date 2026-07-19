import { describe, expect, it } from 'vitest';
import {
    MAX_HISTORY_SESSIONS,
    MAX_INGEST_SESSIONS,
    parseHistoryBody,
    parseIngestBody,
    validateUsername,
} from '@/lib/validate';

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
        for (const source of ['claude_code', 'codex', 'opencode', 'pi']) {
            const r = parseIngestBody({ ...good, source });
            expect(r.ok).toBe(true);
            if (r.ok) expect(r.value.source).toBe(source);
        }
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
