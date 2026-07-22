import { spawn } from 'node:child_process';
import { loadConfig } from './config';
import { DRY_RUN } from './lib/flags';
import { asObject } from './lib/parse-utils';
import type { ReporterConfig } from './lib/types';

/** Open a URL in the default browser (best-effort; ignores failures). */
function openBrowser(url: string): void {
    const cmd =
        process.platform === 'darwin'
            ? 'open'
            : process.platform === 'win32'
              ? 'cmd'
              : 'xdg-open';
    const args =
        process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    try {
        spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
    } catch {
        // Non-fatal: the URL is also printed for manual opening.
    }
}

async function login(cfg: ReporterConfig): Promise<void> {
    const endpoint = `${cfg.apiBase}/api/session`;
    if (DRY_RUN) {
        process.stdout.write(
            `${JSON.stringify(
                {
                    method: 'POST',
                    url: endpoint,
                    headers: { Authorization: 'Bearer <redacted>' },
                },
                null,
                2,
            )}\n`,
        );
        return;
    }
    const res = await fetch(`${cfg.apiBase}/api/session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.token}` },
    });
    const data = asObject(await res.json().catch(() => ({})));
    if (!res.ok || typeof data.url !== 'string') {
        throw new Error(
            typeof data.error === 'string'
                ? data.error
                : `login failed (${res.status})`,
        );
    }
    process.stdout.write(
        `Opening login link in your browser:\n  ${data.url}\n`,
    );
    openBrowser(data.url);
}

export async function runLogin(): Promise<void> {
    try {
        await login(loadConfig());
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`tokenmaxer: ${message}\n`);
        process.exit(1);
    }
}
