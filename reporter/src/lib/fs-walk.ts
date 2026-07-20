import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function walkJsonl(
    dir: string,
    sinceMs: number,
    match: (name: string) => boolean,
): string[] {
    const out: string[] = [];
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
            out.push(...walkJsonl(full, sinceMs, match));
        } else if (e.isFile() && match(e.name)) {
            if (sinceMs <= 0) {
                out.push(full);
                continue;
            }
            try {
                if (statSync(full).mtimeMs >= sinceMs) out.push(full);
            } catch {
                /* ignore */
            }
        }
    }
    return out;
}
