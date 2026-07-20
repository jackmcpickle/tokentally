import { loadConfig } from './config';
import { DRY_RUN } from './lib/flags';
import { asObject } from './lib/parse-utils';
import type { ReporterConfig } from './lib/types';

export function parseSetProfileUrlArgs(
    argv: string[],
): { clear: true } | { clear: false; url: string } {
    const args = argv.filter((a) => a !== '--dry-run');
    if (args.length === 1 && args[0] === '--clear') return { clear: true };
    if (
        args.length === 1 &&
        typeof args[0] === 'string' &&
        args[0].length > 0
    ) {
        return { clear: false, url: args[0] };
    }
    throw new Error(
        'usage: tokenmaxer set-profile-url <https-url> | tokenmaxer set-profile-url --clear [--dry-run]',
    );
}

export function buildProfileUrlBody(parsed: { clear: true }): { url: null };
export function buildProfileUrlBody(parsed: { clear: false; url: string }): {
    url: string;
};
export function buildProfileUrlBody(
    parsed: { clear: true } | { clear: false; url: string },
): { url: string | null } {
    return parsed.clear ? { url: null } : { url: parsed.url };
}

export function buildProfileUrlDryRun(args: {
    endpoint: string;
    body: { url: string | null };
}): {
    method: 'POST';
    url: string;
    headers: {
        'Content-Type': 'application/json';
        Authorization: 'Bearer <redacted>';
    };
    body: { url: string | null };
} {
    return {
        method: 'POST',
        url: args.endpoint,
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer <redacted>',
        },
        body: args.body,
    };
}

async function setProfileUrl(
    cfg: ReporterConfig,
    argv: string[],
): Promise<void> {
    const parsed = parseSetProfileUrlArgs(argv);
    const body: { url: string | null } = parsed.clear
        ? buildProfileUrlBody({ clear: true })
        : buildProfileUrlBody({ clear: false, url: parsed.url });
    const endpoint = `${cfg.apiBase}/api/profile`;
    if (DRY_RUN) {
        process.stdout.write(
            `${JSON.stringify(buildProfileUrlDryRun({ endpoint, body }), null, 2)}\n`,
        );
        return;
    }
    const res = await fetch(`${cfg.apiBase}/api/profile`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.token}`,
        },
        body: JSON.stringify(body),
    });
    const data: unknown = await res.json().catch(() => ({}));
    const payload = asObject(data);
    if (!res.ok) {
        throw new Error(
            typeof payload.error === 'string'
                ? payload.error
                : `profile update failed (${res.status})`,
        );
    }
    if (payload.url) {
        process.stdout.write(`profile url: ${payload.url}\n`);
    } else {
        process.stdout.write('profile url: cleared\n');
    }
}

export async function runSetProfileUrl(argv: string[]): Promise<void> {
    try {
        await setProfileUrl(loadConfig(), argv);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`tokenmaxer: ${message}\n`);
        process.exit(1);
    }
}
