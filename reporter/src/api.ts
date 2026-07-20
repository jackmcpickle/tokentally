import { DRY_RUN, MAX_SESSIONS_PER_REQUEST } from './lib/flags';
import { asObject } from './lib/parse-utils';
import type { PostOpts, ReporterConfig, ReporterRow } from './lib/types';

export interface PostResult {
    accepted: number;
    // Rows the server rejected individually (structural problems reported
    // per row) and rows lost to whole-batch failures (HTTP/network errors).
    rejected: number;
    failed: number;
}

function describeRejections(data: Record<string, unknown>): number {
    const rejected = data.rejected;
    if (!Array.isArray(rejected) || rejected.length === 0) return 0;
    for (const entry of rejected.slice(0, 3)) {
        const r = asObject(entry);
        process.stderr.write(
            `tokenmaxer: server rejected row ${String(r.index)}: ${String(
                r.error,
            )}\n`,
        );
    }
    if (rejected.length > 3) {
        process.stderr.write(
            `tokenmaxer: … and ${rejected.length - 3} more rejected row(s)\n`,
        );
    }
    return rejected.length;
}

async function postBatch(
    cfg: ReporterConfig,
    source: string,
    batch: ReporterRow[],
    path: string,
): Promise<PostResult> {
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
        return { accepted: batch.length, rejected: 0, failed: 0 };
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
            const obj = asObject(data);
            const rejected = describeRejections(obj);
            const accepted =
                typeof obj.accepted === 'number'
                    ? obj.accepted
                    : batch.length - rejected;
            return { accepted, rejected, failed: 0 };
        }
        // Surface the response body: a silent status code hides which rows
        // (and why) a whole batch was refused.
        const body = (await res.text().catch(() => '')).slice(0, 300);
        process.stderr.write(
            `tokenmaxer: ingest failed (${res.status})${body ? `: ${body}` : ''}\n`,
        );
        return { accepted: 0, rejected: 0, failed: batch.length };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`tokenmaxer: ingest failed: ${message}\n`);
        return { accepted: 0, rejected: 0, failed: batch.length };
    } finally {
        clearTimeout(timer);
    }
}

export async function postSessions(
    cfg: ReporterConfig,
    source: string,
    rows: ReporterRow[],
    opts: PostOpts = {},
): Promise<PostResult> {
    if (rows.length === 0) return { accepted: 0, rejected: 0, failed: 0 };
    const path = opts.path ?? '/api/ingest';
    const chunkSize = opts.chunkSize ?? MAX_SESSIONS_PER_REQUEST;
    const batches: ReporterRow[][] = [];
    for (let i = 0; i < rows.length; i += chunkSize) {
        batches.push(rows.slice(i, i + chunkSize));
    }
    const results = await Promise.all(
        batches.map((batch) => postBatch(cfg, source, batch, path)),
    );
    return results.reduce(
        (sum, r) => ({
            accepted: sum.accepted + r.accepted,
            rejected: sum.rejected + r.rejected,
            failed: sum.failed + r.failed,
        }),
        { accepted: 0, rejected: 0, failed: 0 },
    );
}

export async function readStdin(): Promise<string> {
    if (process.stdin.isTTY) return '';
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
}
