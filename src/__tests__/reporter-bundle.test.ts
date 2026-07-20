import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const BUNDLE = resolve(import.meta.dirname, '../../reporter/tokentally.mjs');

describe('reporter single-file bundle', () => {
    it('emits one tokentally.mjs without relative local imports', () => {
        expect(existsSync(BUNDLE)).toBe(true);
        const source = readFileSync(BUNDLE, 'utf8');
        // Bundled output must not import sibling reporter modules.
        expect(source).not.toMatch(/from ['"]\.\/[^'"]+['"]/u);
        expect(source).not.toMatch(/from ['"]\.\.\/[^'"]+['"]/u);
        // Still a CLI entry.
        expect(source.startsWith('#!/usr/bin/env node')).toBe(true);
        // Named exports used by tests/worker stay present.
        expect(source).toContain('parseClaudeTranscript');
        expect(source).toContain('parseCodexRollout');
        expect(source).toContain('parseOpencodeMessages');
        expect(source).toContain('parsePiRollout');
        expect(source).toContain('parseCursorEvents');
    });
});
