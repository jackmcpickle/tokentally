import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
    backfill,
    claudeCatchup,
    claudeSessionEnd,
    codexCatchup,
    cursorSync,
    opencodeCatchup,
    piCatchup,
    reportOne,
    reportOneOpencode,
} from './commands';
import { loadConfig } from './config';
import { runLogin } from './login';
import { runSetProfileUrl } from './profile';

// Commands you run yourself.
const USER_COMMANDS: Array<[string, string]> = [
    ['login', 'open a browser login link to manage hackathons'],
    [
        'backfill [claude|codex|opencode|pi|cursor]',
        'one-time: upload ALL past history (optionally scoped to one source)',
    ],
    ['cursor-sync', 'sync recent Cursor dashboard usage'],
    ['set-profile-url <https-url>', 'set your public profile link'],
    ['set-profile-url --clear', 'clear your public profile link'],
    ['help', 'show this help'],
];

// Commands wired into agent hooks (SessionStart/SessionEnd) — not run by hand.
const HOOK_COMMANDS: Array<[string, string]> = [
    [
        'claude-sessionend',
        'parse the just-ended Claude transcript (stdin JSON)',
    ],
    ['claude-sessionstart', 'catch up recent Claude sessions'],
    ['codex-sessionstart', 'catch up recent Codex sessions'],
    ['opencode-sessionstart', 'catch up recent opencode sessions'],
    ['pi-sessionstart', 'catch up recent pi sessions'],
    ['claude-report <path>', 'parse and report one Claude transcript'],
    ['codex-report <path>', 'parse and report one Codex rollout'],
    ['opencode-report <sessionID>', 'parse and report one opencode session'],
    ['pi-report <path>', 'parse and report one pi session file'],
];

function printHelp(): void {
    const pad = Math.max(
        ...[...USER_COMMANDS, ...HOOK_COMMANDS].map(([c]) => c.length),
    );
    function fmt(rows: Array<[string, string]>): string[] {
        return rows.map(([c, d]) => `  ${c.padEnd(pad)}  ${d}`);
    }
    process.stdout.write(
        [
            'tokenmaxer — report per-session token usage to a tokenmaxer leaderboard.',
            '',
            'Usage: tokenmaxer <command> [args] [--dry-run]',
            '',
            'Commands you run:',
            ...fmt(USER_COMMANDS),
            '',
            'Hook commands (wired into agent SessionStart/SessionEnd; not run by hand):',
            ...fmt(HOOK_COMMANDS),
            '',
            'Append --dry-run to any command to print payloads instead of sending.',
            '',
            'Config: ~/.tokenmaxer/config.json => { "apiBase": "https://...", "token": "tt_..." }',
            '  (env TOKENMAXER_API_BASE / TOKENMAXER_TOKEN override the file.)',
            'Get a token and hooks at <https://tokenmaxer.quest/start>.',
            '',
        ].join('\n'),
    );
}

const HELP_FLAGS = new Set<string | undefined>([
    'help',
    '--help',
    '-h',
    undefined,
]);

export async function main(): Promise<void> {
    const cmd = process.argv[2];
    if (HELP_FLAGS.has(cmd)) {
        printHelp();
        return;
    }
    if (cmd === 'set-profile-url') {
        await runSetProfileUrl(process.argv.slice(3));
        return;
    }
    if (cmd === 'login') {
        await runLogin();
        return;
    }
    const cfg = loadConfig();
    switch (cmd) {
        case 'claude-sessionend':
            await claudeSessionEnd(cfg);
            break;
        case 'claude-sessionstart':
            await claudeCatchup(cfg);
            break;
        case 'codex-sessionstart':
        case 'codex-sessionend':
            await codexCatchup(cfg);
            break;
        case 'opencode-sessionstart':
        case 'opencode-sessionend':
            await opencodeCatchup(cfg);
            break;
        case 'pi-sessionstart':
        case 'pi-sessionend':
            await piCatchup(cfg);
            break;
        case 'claude-report':
            await reportOne(cfg, process.argv[3], 'claude_code');
            break;
        case 'codex-report':
            await reportOne(cfg, process.argv[3], 'codex');
            break;
        case 'opencode-report':
            await reportOneOpencode(cfg, process.argv[3]);
            break;
        case 'pi-report':
            await reportOne(cfg, process.argv[3], 'pi');
            break;
        case 'cursor-sync':
            await cursorSync(cfg);
            break;
        case 'backfill': {
            // Optional scope: `backfill claude|codex|opencode|pi|cursor`.
            const scope = process.argv[3];
            const only = [
                'claude',
                'codex',
                'opencode',
                'pi',
                'cursor',
            ].includes(scope ?? '')
                ? scope
                : undefined;
            await backfill(cfg, only);
            break;
        }
        default:
            process.stderr.write(
                'usage: tokenmaxer <claude-sessionend|claude-sessionstart|codex-sessionstart|opencode-sessionstart|pi-sessionstart|claude-report <path>|codex-report <path>|opencode-report <sessionID>|pi-report <path>|cursor-sync|backfill [claude|codex|opencode|pi|cursor]|set-profile-url (<https-url>|--clear)> [--dry-run]\n',
            );
    }
}

// Only run as a CLI when executed directly — importing (tests) must not trigger it.
// argv[1] may be a symlink (global/npx bin); resolve it so import.meta.url matches.
export function invokedDirectlyAs(argvPath: string | undefined): boolean {
    if (typeof argvPath !== 'string') return false;
    let resolved = argvPath;
    try {
        resolved = realpathSync(argvPath);
    } catch {
        // fall back to the raw path
    }
    return import.meta.url === pathToFileURL(resolved).href;
}
