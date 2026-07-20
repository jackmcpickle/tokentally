import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectRowsFromJsonlDirs } from '../../reporter/src/lib/collect';
import type { ReporterRow } from '../../reporter/src/lib/types';

describe('collectRowsFromJsonlDirs', () => {
    let root: string;

    afterEach(() => {
        if (root) rmSync(root, { recursive: true, force: true });
    });

    it('walks matching files and flattens parse results', () => {
        root = mkdtempSync(join(tmpdir(), 'tm-collect-'));
        const nested = join(root, 'a', 'b');
        mkdirSync(nested, { recursive: true });
        writeFileSync(join(nested, 'one.jsonl'), 'x');
        writeFileSync(join(nested, 'skip.txt'), 'x');
        writeFileSync(join(root, 'two.jsonl'), 'y');

        const seen: string[] = [];
        const { files, rows } = collectRowsFromJsonlDirs({
            dirs: [root],
            sinceMs: 0,
            match: (name) => name.endsWith('.jsonl'),
            parseFile: (path) => {
                seen.push(path);
                return [
                    {
                        session_id: path,
                        model: 'm',
                        started_at: 1,
                        input_tokens: 1,
                        output_tokens: 0,
                        cache_read_tokens: 0,
                        cache_creation_tokens: 0,
                        reasoning_tokens: 0,
                    } satisfies ReporterRow,
                ];
            },
        });

        expect(files).toHaveLength(2);
        expect(rows).toHaveLength(2);
        expect(seen.sort()).toEqual(files.sort());
        expect(files.every((f) => f.endsWith('.jsonl'))).toBe(true);
    });

    it('swallows parse errors per file', () => {
        root = mkdtempSync(join(tmpdir(), 'tm-collect-err-'));
        writeFileSync(join(root, 'ok.jsonl'), 'x');
        writeFileSync(join(root, 'bad.jsonl'), 'x');

        const { rows } = collectRowsFromJsonlDirs({
            dirs: [root],
            sinceMs: 0,
            match: (name) => name.endsWith('.jsonl'),
            parseFile: (path) => {
                if (path.endsWith('bad.jsonl')) throw new Error('boom');
                return [
                    {
                        session_id: 'ok',
                        model: 'm',
                        started_at: 1,
                        input_tokens: 1,
                        output_tokens: 0,
                        cache_read_tokens: 0,
                        cache_creation_tokens: 0,
                        reasoning_tokens: 0,
                    },
                ];
            },
        });

        expect(rows).toEqual([expect.objectContaining({ session_id: 'ok' })]);
    });
});
