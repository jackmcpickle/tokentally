import { describe, expect, it } from 'vitest';
import { parseIngestBody, validateUsername } from '@/lib/validate';

describe('validateUsername', () => {
    it('accepts valid handles', () => {
        expect(validateUsername('tokenlord')).toEqual({ ok: true, value: 'tokenlord' });
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
    it('rejects empty sessions', () => {
        expect(parseIngestBody({ source: 'codex', sessions: [] }).ok).toBe(false);
    });
    it('coerces negative/NaN counts to 0', () => {
        const r = parseIngestBody({
            source: 'codex',
            sessions: [{ session_id: 's', model: 'm', input_tokens: -5, output_tokens: 'x' }],
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
            sessions: [{ session_id: 's', model: 'm', input_tokens: 5_000_000_000 }],
        });
        expect(r.ok).toBe(false);
    });
    it('requires session_id and model', () => {
        expect(
            parseIngestBody({ source: 'codex', sessions: [{ model: 'm' }] }).ok,
        ).toBe(false);
        expect(
            parseIngestBody({ source: 'codex', sessions: [{ session_id: 's' }] }).ok,
        ).toBe(false);
    });
});
