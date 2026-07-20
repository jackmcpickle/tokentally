import { walkJsonl } from './fs-walk.ts';
import type { ReporterRow } from './types.ts';

export function collectRowsFromJsonlDirs(options: {
    dirs: string[];
    sinceMs: number;
    match: (name: string) => boolean;
    parseFile: (path: string) => ReporterRow[];
}): { files: string[]; rows: ReporterRow[] } {
    const files = options.dirs.flatMap((d) =>
        walkJsonl(d, options.sinceMs, options.match),
    );
    const rows: ReporterRow[] = [];
    for (const file of files) {
        try {
            rows.push(...options.parseFile(file));
        } catch {
            /* skip unreadable / unparseable file */
        }
    }
    return { files, rows };
}
