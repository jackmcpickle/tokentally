import { describe, expect, it } from 'vitest';
import {
    COUNTRIES,
    countryName,
    flagEmoji,
    isValidCountry,
} from '@/lib/countries';

describe('countries', () => {
    it('recognizes known codes and rejects unknown', () => {
        expect(isValidCountry('AU')).toBe(true);
        expect(isValidCountry('US')).toBe(true);
        expect(isValidCountry('ZZ')).toBe(false);
        // Case-sensitive: codes are stored uppercased.
        expect(isValidCountry('au')).toBe(false);
    });

    it('maps codes to names', () => {
        expect(countryName('AU')).toBe('Australia');
        expect(countryName('ZZ')).toBe('ZZ');
    });

    it('derives a flag emoji from the code', () => {
        // AU -> regional indicators 🇦🇺
        expect(flagEmoji('AU')).toBe('\u{1F1E6}\u{1F1FA}');
        expect(flagEmoji('us')).toBe('\u{1F1FA}\u{1F1F8}');
        expect(flagEmoji('X')).toBe('');
    });

    it('has unique, well-formed codes', () => {
        const codes = COUNTRIES.map((c) => c.code);
        expect(new Set(codes).size).toBe(codes.length);
        for (const c of codes) expect(c).toMatch(/^[A-Z]{2}$/u);
    });
});
