const REPO_URL = 'https://github.com/jackmcpickle/tokenmaxer';

function snippets(base: string): {
    setup: string;
    claude: string;
    codex: string;
    opencode: string;
    pi: string;
    cursor: string;
    agent: string;
} {
    const setup =
        'npm install -g tokenmaxer && \\\n' +
        '  mkdir -p ~/.tokenmaxer && \\\n' +
        "  printf '%s' '" +
        JSON.stringify({ apiBase: base, token: 'YOUR_TOKEN' }) +
        "' > ~/.tokenmaxer/config.json";

    const claude = JSON.stringify(
        {
            hooks: {
                SessionStart: [
                    {
                        type: 'shell',
                        command: 'tokenmaxer claude-sessionstart',
                    },
                ],
                SessionEnd: [
                    {
                        type: 'shell',
                        command: 'tokenmaxer claude-sessionend',
                    },
                ],
            },
        },
        null,
        2,
    );

    const codex =
        '[[hooks.SessionStart.hooks]]\n' +
        'type = "command"\n' +
        'command = "tokenmaxer codex-sessionstart"';

    const opencode =
        '# add to ~/.bashrc or ~/.zshrc\n' +
        'opencode() { command opencode "$@"; tokenmaxer opencode-sessionstart; }';

    const pi =
        '# add to ~/.bashrc or ~/.zshrc\n' +
        'pi() { command pi "$@"; tokenmaxer pi-sessionstart; }';

    const cursor = JSON.stringify(
        {
            version: 1,
            hooks: {
                sessionStart: [{ command: 'tokenmaxer cursor-sync' }],
            },
        },
        null,
        2,
    );

    const agent =
        'Help me finish setting up tokenmaxer.quest, an open-source token-usage leaderboard.\n' +
        'It uploads only per-session token counts, model names, session ids and timestamps —\n' +
        'never prompts, code, or credentials. Source: ' +
        REPO_URL +
        '\n' +
        'I already ran the one-time setup, so ~/.tokenmaxer/config.json holds my API token.\n' +
        'Read ' +
        base +
        '/start.md for the exact hook snippets, then:\n' +
        '1. Install the reporter: npm install -g tokenmaxer (a single zero-dependency script — review it first if you like).\n' +
        '2. Detect which coding tools I use (Claude Code / Codex / opencode / pi / Cursor) and configure the matching hooks from start.md.\n' +
        '3. Run `tokenmaxer backfill --dry-run` and show me a sample of what would be uploaded, then run `tokenmaxer backfill`.\n' +
        '4. Confirm my sessions appear at ' +
        base +
        '/u/YOUR_USERNAME';

    return { setup, claude, codex, opencode, pi, cursor, agent };
}

export function startMarkdown(base: string): string {
    const s = snippets(base);

    return `# Get started

Pick a username, get a token, and configure hooks so your coding tools report token usage. No email, no password — the token is your only credential, so keep it somewhere safe.

## What leaves your machine

The reporter uploads **per-session token counts, model names, session ids and timestamps** — never prompts, code, file contents, file paths, or credentials. It's a single zero-dependency Node script, published on npm as [\`tokenmaxer\`](https://www.npmjs.com/package/tokenmaxer) and open source at ${REPO_URL}. Append \`--dry-run\` to any command to print the exact payloads instead of sending them:

\`\`\`shell
tokenmaxer backfill --dry-run
\`\`\`

## Claim a username

Username claims are invite-only. Open \`/invite?token=…\` in a browser first so the invite session cookie is set, then claim via \`POST /api/register\`:

\`\`\`json
POST /api/register
Content-Type: application/json

{ "username": "yourname", "turnstileToken": "…", "url": "https://example.com/me" }
\`\`\`

\`url\` is optional (https only). Omit it to claim without a public link — you can set or change it later with \`tokenmaxer set-profile-url\`.

The response includes your username and token (shown once). Save the token — lost tokens cannot be recovered.

## One-time setup

Installs the reporter from npm and writes your config (the token lives only in \`~/.tokenmaxer/config.json\`, never in shared settings). Run in a terminal:

\`\`\`shell
${s.setup}
\`\`\`

## Agent prompt

Run the one-time setup yourself (so your token never enters the chat), then paste this into your coding agent — it will read this page and do the rest:

\`\`\`
${s.agent}
\`\`\`

## Claude Code

Merge into \`~/.claude/settings.json\`:

\`\`\`json
${s.claude}
\`\`\`

## Codex

Add to \`~/.codex/config.toml\`. Codex has no SessionEnd hook, so your latest session reports when you next launch Codex:

\`\`\`toml
${s.codex}
\`\`\`

## opencode

opencode has no shell hooks, so add a wrapper function to your \`~/.bashrc\` or \`~/.zshrc\`. It reports your latest sessions each time opencode exits:

\`\`\`shell
${s.opencode}
\`\`\`

## pi

Same idea for pi — add a wrapper function to your \`~/.bashrc\` or \`~/.zshrc\`:

\`\`\`shell
${s.pi}
\`\`\`

## Cursor

Cursor doesn't expose token usage to hooks, so the reporter reads your own usage from Cursor's dashboard API using the Cursor login already on this machine. That login is sent **only to cursor.com** — it never reaches tokenmaxer servers, and only the resulting token counts are uploaded. Add this to \`~/.cursor/hooks.json\` so every session triggers a sync:

\`\`\`json
${s.cursor}
\`\`\`

If auto-auth fails (Cursor not logged in on this machine), see the [reporter README](${REPO_URL}/tree/main/reporter) for the manual \`cursorCookie\` fallback.

## Backfill past history (optional)

The hooks only report new sessions. To include sessions from before you installed tokenmaxer.quest, run this once — it computes token-count summaries from your local Claude Code, Codex, opencode, pi, and Cursor transcripts and uploads only those summaries (idempotent, so it's safe to re-run). Use \`--dry-run\` first to inspect the payload, and add \`claude\`, \`codex\`, \`opencode\`, \`pi\`, or \`cursor\` to limit it to one tool:

\`\`\`shell
tokenmaxer backfill --dry-run
tokenmaxer backfill
\`\`\`
`;
}
