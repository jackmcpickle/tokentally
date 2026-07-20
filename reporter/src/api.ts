import { DRY_RUN, MAX_SESSIONS_PER_REQUEST } from './lib/flags';
import { asObject } from './lib/parse-utils';
import type { PostOpts, ReporterConfig, ReporterRow } from './lib/types';

async function postBatch(
    cfg: ReporterConfig,
    source: string,
    batch: ReporterRow[],
    path: string,
): Promise<number> {
    if (DRY_RUN) {
        process.stdout.write(
            `${JSON.stringify(
                {
                    dryRun: true,
                    url: `${cfg.apiBase}${path}`,
                    body: { source, sessions: batch },
                },
                null,
                2,
            )}\n`,
        );
        return batch.length;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
        const res = await fetch(`${cfg.apiBase}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${cfg.token}`,
            },
            body: JSON.stringify({ source, sessions: batch }),
            signal: controller.signal,
        });
        if (res.ok) {
            const data: unknown = await res.json().catch(() => ({}));
            const accepted = asObject(data).accepted;
            return typeof accepted === 'number' ? accepted : batch.length;
        }
        process.stderr.write(`tokenmaxer: ingest failed (${res.status})\n`);
        return 0;
    } finally {
        clearTimeout(timer);
    }
}

export async function postSessions(
    cfg: ReporterConfig,
    source: string,
    rows: ReporterRow[],
    opts: PostOpts = {},
): Promise<{ accepted: number }> {
    if (rows.length === 0) return { accepted: 0 };
    const path = opts.path ?? '/api/ingest';
    const chunkSize = opts.chunkSize ?? MAX_SESSIONS_PER_REQUEST;
    const batches: ReporterRow[][] = [];
    for (let i = 0; i < rows.length; i += chunkSize) {
        batches.push(rows.slice(i, i + chunkSize));
    }
    const acceptedCounts = await Promise.all(
        batches.map((batch) => postBatch(cfg, source, batch, path)),
    );
    return { accepted: acceptedCounts.reduce((sum, n) => sum + n, 0) };
}

export async function readStdin(): Promise<string> {
    if (process.stdin.isTTY) return '';
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
}
