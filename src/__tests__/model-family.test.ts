import { describe, expect, it } from 'vitest';
import { distinctFamilies, familyLabel, familyOf } from '@/lib/model-family';

describe('familyOf', () => {
    it('hides synthetic models', () => {
        expect(familyOf('<synthetic>')).toBeNull();
        expect(familyOf('synthetic')).toBeNull();
    });

    it('bundles versioned Claude models by family', () => {
        expect(familyOf('claude-sonnet-4-6')).toBe('sonnet');
        expect(familyOf('claude-sonnet-5')).toBe('sonnet');
        expect(familyOf('claude-opus-4-8')).toBe('opus');
        expect(familyOf('claude-haiku-4-5-20251001')).toBe('haiku');
        expect(familyOf('claude-fable-5')).toBe('fable');
    });

    it('bundles Codex separately from other GPT models', () => {
        expect(familyOf('gpt-5.2-codex')).toBe('codex');
        expect(familyOf('gpt-5.3-codex')).toBe('codex');
        expect(familyOf('gpt-5.4')).toBe('gpt');
        expect(familyOf('gpt-5.5')).toBe('gpt');
        expect(familyOf('o3')).toBe('gpt');
    });
});

describe('distinctFamilies', () => {
    it('dedupes, drops synthetic, and sorts by label', () => {
        expect(
            distinctFamilies([
                'claude-sonnet-5',
                '<synthetic>',
                'claude-sonnet-4-6',
                'gpt-5.4',
                'claude-opus-4-8',
                'gpt-5.2-codex',
            ]),
        ).toEqual(['codex', 'gpt', 'opus', 'sonnet']);
    });
});

describe('familyLabel', () => {
    it('returns a display name for known families', () => {
        expect(familyLabel('sonnet')).toBe('Sonnet');
        expect(familyLabel('codex')).toBe('Codex');
    });
});
