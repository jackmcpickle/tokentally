import { describe, expect, it } from 'vitest';
// Guard the privacy claims made on /start and in the READMEs: the reporter only
// ever POSTs {source, sessions} to the configured apiBase, and the Cursor
// session cookie is only ever sent to cursor.com.
import source from '../../reporter/tokentally.mjs?raw';

describe('reporter privacy guarantees', () => {
    it('only fetches the configured apiBase and cursor.com', () => {
        const urls = [...source.matchAll(/fetch\(\s*([\s\S]*?)\s*,/gu)].map(
            (m) => (m[1] ?? '').replace(/\s+/gu, ' ').trim(),
        );
        expect(urls.length).toBeGreaterThan(0);
        for (const url of urls) {
            const ok =
                url.includes('${cfg.apiBase}') ||
                /['"]https:\/\/cursor\.com\//u.test(url);
            expect(ok).toBe(true);
        }
    });

    it('never sends the cursor cookie to the apiBase', () => {
        // The apiBase POST body is exactly {source, sessions: batch}.
        expect(source).toContain(
            'body: JSON.stringify({ source, sessions: batch })',
        );
        // The Cookie header appears only once, in the cursor.com fetch
        // (excluding the cfg field name "cursorCookie").
        const cookieUses = source.match(/(?<!cursor)Cookie:/gu) ?? [];
        expect(cookieUses).toHaveLength(1);
    });

    it('supports --dry-run on every command', () => {
        expect(source).toMatch(/process\.argv\.includes\(['"]--dry-run['"]\)/u);
        expect(source).toContain('dryRun: true');
    });
});
