import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DRY_RUN } from './lib/flags';
import type { JsonObject, ReporterConfig } from './lib/types';

function readConfigFile(dirName: string): JsonObject | null {
    try {
        const raw = readFileSync(
            join(homedir(), dirName, 'config.json'),
            'utf8',
        );
        const parsed: unknown = JSON.parse(raw);
        return parsed !== null && typeof parsed === 'object'
            ? (parsed as JsonObject)
            : null;
    } catch {
        return null;
    }
}

export function loadConfig(): ReporterConfig {
    // Prefer ~/.tokenmaxer; fall back to legacy ~/.tokentally.
    const file =
        readConfigFile('.tokenmaxer') ?? readConfigFile('.tokentally') ?? {};
    const apiBase =
        process.env.TOKENMAXER_API_BASE ??
        process.env.TOKENTALLY_API_BASE ??
        file.apiBase;
    const token =
        process.env.TOKENMAXER_TOKEN ??
        process.env.TOKENTALLY_TOKEN ??
        file.token;
    if (!apiBase || !token) {
        // Dry runs never send anything, so let them work before configuration.
        if (DRY_RUN) {
            return {
                apiBase: String(apiBase ?? 'https://tokenmaxer.quest').replace(
                    /\/+$/u,
                    '',
                ),
                token: String(token ?? 'DRY_RUN'),
                cursorCookie:
                    typeof file.cursorCookie === 'string'
                        ? file.cursorCookie
                        : undefined,
            };
        }
        throw new Error(
            'tokenmaxer not configured (missing apiBase/token in ~/.tokenmaxer/config.json)',
        );
    }
    return {
        apiBase: String(apiBase).replace(/\/+$/u, ''),
        token: String(token),
        cursorCookie:
            typeof file.cursorCookie === 'string'
                ? file.cursorCookie
                : undefined,
    };
}
