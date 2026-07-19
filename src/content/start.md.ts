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
        'mkdir -p ~/.tokentally && \\\n' +
        '  curl -fsSL ' +
        base +
        '/tokentally.mjs -o ~/.tokentally/tokentally.mjs && \\\n' +
        "  printf '%s' '" +
        JSON.stringify({ apiBase: base, token: 'YOUR_TOKEN' }) +
        "' > ~/.tokentally/config.json";

    const claude = JSON.stringify(
        {
            hooks: {
                SessionStart: [
                    {
                        type: 'shell',
                        command:
                            'node ~/.tokentally/tokentally.mjs claude-sessionstart',
                    },
                ],
                SessionEnd: [
                    {
                        type: 'shell',
                        command:
                            'node ~/.tokentally/tokentally.mjs claude-sessionend',
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
        'command = "node ~/.tokentally/tokentally.mjs codex-sessionstart"';

    const opencode =
        '# add to ~/.bashrc or ~/.zshrc\n' +
        'opencode() { command opencode "$@"; node ~/.tokentally/tokentally.mjs opencode-sessionstart; }';

    const pi =
        '# add to ~/.bashrc or ~/.zshrc\n' +
        'pi() { command pi "$@"; node ~/.tokentally/tokentally.mjs pi-sessionstart; }';

    const cursor = JSON.stringify(
        {
            version: 1,
            hooks: {
                sessionStart: [
                    {
                        command:
                            'node ~/.tokentally/tokentally.mjs cursor-sync',
                    },
                ],
            },
        },
        null,
        2,
    );

    const agent =
        'Go to ' +
        base +
        '/start and help me set up tokentally (token usage leaderboard).\n' +
        'My username: YOUR_USERNAME\n' +
        'My token: YOUR_TOKEN\n' +
        'Do this for me:\n' +
        '1. Run the one-time setup command from that page (downloads ~/.tokentally/tokentally.mjs and writes config).\n' +
        '2. Detect which coding tools I use (Claude Code / Codex / opencode / pi / Cursor) and configure the matching hooks from the page.\n' +
        '3. Run: node ~/.tokentally/tokentally.mjs backfill\n' +
        '4. Confirm my sessions appear at ' +
        base +
        '/u/YOUR_USERNAME';

    return { setup, claude, codex, opencode, pi, cursor, agent };
}

export function startMarkdown(base: string): string {
    const s = snippets(base);

    return `# Get started

Pick a username, get a token, and configure hooks so your coding tools report token usage. No email, no password — the token is your only credential, so keep it somewhere safe.

## Claim a username

Username claims are invite-only. Open \`/invite?invite=…\` in a browser first so the invite session cookie is set, then claim via \`POST /api/register\`:

\`\`\`json
POST /api/register
Content-Type: application/json

{ "username": "yourname", "turnstileToken": "…" }
\`\`\`

The response includes your username and token (shown once). Save the token — lost tokens cannot be recovered.

## One-time setup

Downloads the reporter and writes your config (the token lives here, never in shared settings). Run in a terminal:

\`\`\`shell
${s.setup}
\`\`\`

## Agent prompt

Paste this into your coding agent — it will read the start page and do the setup for you:

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

Cursor doesn't expose token usage to hooks, so the reporter pulls your usage from Cursor's dashboard API. It auto-reads your Cursor login from local storage — no extra auth in the common case. Add this to \`~/.cursor/hooks.json\` so every session triggers a sync:

\`\`\`json
${s.cursor}
\`\`\`

If auto-auth fails (Cursor not logged in on this machine), copy the \`WorkosCursorSessionToken\` cookie from cursor.com (DevTools → Application → Cookies) into \`~/.tokentally/config.json\` as \`"cursorCookie"\`. This uses an unofficial Cursor endpoint, so the cookie may occasionally need refreshing.

## Backfill past history (optional)

The hooks only report new sessions. To load everything you ran before installing tokenmaxer.quest, run this once — it scans all your local Claude Code, Codex, opencode, pi, and Cursor history and uploads it (idempotent, so it's safe to re-run). Add \`claude\`, \`codex\`, \`opencode\`, \`pi\`, or \`cursor\` to limit it to one tool:

\`\`\`shell
node ~/.tokentally/tokentally.mjs backfill
\`\`\`
`;
}
