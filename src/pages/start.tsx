import type { FC } from 'hono/jsx';
import { Button } from '@/pages/components/button';
import { Input } from '@/pages/components/input';
import { Layout } from '@/pages/layout';
import {
    copyrow,
    field,
    fieldLbl,
    hero,
    muted,
    notice,
    panel,
    sub,
} from '@/pages/ui';

const TURNSTILE_SITE_KEY = '0x4AAAAAAD4Z_7GmvQFkW-X3';

function clientScript(base: string): string {
    return `
const BASE = ${JSON.stringify(base)} || location.origin;
const form = document.getElementById('reg');
const err = document.getElementById('err');
const result = document.getElementById('result');

function snippets(username, token) {
  const setup =
    'mkdir -p ~/.tokentally && \\\\\\n' +
    '  curl -fsSL ' + BASE + '/tokentally.mjs -o ~/.tokentally/tokentally.mjs && \\\\\\n' +
    "  printf '%s' '" + JSON.stringify({ apiBase: BASE, token }) + "' > ~/.tokentally/config.json";
  const claude = JSON.stringify({
    hooks: {
      SessionStart: [{ type: 'shell', command: 'node ~/.tokentally/tokentally.mjs claude-sessionstart' }],
      SessionEnd: [{ type: 'shell', command: 'node ~/.tokentally/tokentally.mjs claude-sessionend' }]
    }
  }, null, 2);
  const codex =
    '[[hooks.SessionStart.hooks]]\\n' +
    'type = "command"\\n' +
    'command = "node ~/.tokentally/tokentally.mjs codex-sessionstart"';
  const opencode =
    '# add to ~/.bashrc or ~/.zshrc\\n' +
    'opencode() { command opencode "$@"; node ~/.tokentally/tokentally.mjs opencode-sessionstart; }';
  const pi =
    '# add to ~/.bashrc or ~/.zshrc\\n' +
    'pi() { command pi "$@"; node ~/.tokentally/tokentally.mjs pi-sessionstart; }';
  const cursor = JSON.stringify({
    version: 1,
    hooks: {
      sessionStart: [{ command: 'node ~/.tokentally/tokentally.mjs cursor-sync' }]
    }
  }, null, 2);
  const agent =
    'Go to ' + BASE + '/start and help me set up tokentally (token usage leaderboard).\\n' +
    'My username: ' + username + '\\n' +
    'My token: ' + token + '\\n' +
    'Do this for me:\\n' +
    '1. Run the one-time setup command from that page (downloads ~/.tokentally/tokentally.mjs and writes config).\\n' +
    '2. Detect which coding tools I use (Claude Code / Codex / opencode / pi / Cursor) and configure the matching hooks from the page.\\n' +
    '3. Run: node ~/.tokentally/tokentally.mjs backfill\\n' +
    '4. Confirm my sessions appear at ' + BASE + '/u/' + username;
  return { setup, claude, codex, opencode, pi, cursor, agent };
}

function render(username, token) {
  const s = snippets(username, token);
  for (const [k, v] of Object.entries({ 'r-setup': s.setup, 'r-claude': s.claude, 'r-codex': s.codex, 'r-opencode': s.opencode, 'r-pi': s.pi, 'r-cursor': s.cursor, 'r-agent': s.agent })) {
    const el = document.getElementById(k);
    if (el) el.textContent = v;
  }
}
render('YOUR_USERNAME', 'YOUR_TOKEN');

document.querySelectorAll('button.tab').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('button.tab').forEach((x) => x.classList.toggle('tab-active', x === b));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.id !== 'tab-' + b.dataset.tab));
  });
});

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const username = document.getElementById('username').value.trim();
    const turnstileToken = form.querySelector('[name="cf-turnstile-response"]')?.value;
    if (!turnstileToken) { err.textContent = 'Please complete the verification.'; return; }
    const btn = form.querySelector('button');
    btn.disabled = true; btn.textContent = 'Claiming…';
    try {
      // Same-origin so the invite session cookie is included (BASE may differ).
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, turnstileToken })
      });
      const data = await res.json();
      if (!res.ok) {
        err.textContent = data.error || 'Registration failed';
        window.turnstile?.reset();
        return;
      }
      render(data.username, data.token);
      document.getElementById('r-token').textContent = data.token;
      document.getElementById('r-user').textContent = data.username;
      document.getElementById('r-profile').href = '/u/' + data.username;
      result.classList.remove('hidden');
      form.classList.add('hidden');
      document.getElementById('claim-panel')?.classList.add('hidden');
      result.scrollIntoView({ behavior: 'smooth' });
    } catch (e2) {
      err.textContent = 'Network error, please retry.';
      window.turnstile?.reset();
    } finally {
      btn.disabled = false; btn.textContent = 'Claim username';
    }
  });
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button.copy');
  if (!b) return;
  const pre = document.getElementById(b.dataset.target);
  navigator.clipboard.writeText(pre.textContent).then(() => {
    const t = b.textContent; b.textContent = 'Copied!';
    setTimeout(() => { b.textContent = t; }, 1200);
  });
});
`;
}

const TABS: Array<{ id: string; label: string }> = [
    { id: 'agent', label: 'Agent' },
    { id: 'claude', label: 'Claude Code' },
    { id: 'codex', label: 'Codex' },
    { id: 'opencode', label: 'opencode' },
    { id: 'pi', label: 'pi' },
    { id: 'cursor', label: 'Cursor' },
];

const SETUP_TIP = (
    <>
        <p class="mb-3 text-[13px] font-medium tracking-[-0.13px] text-white/80">
            Setup tip
        </p>
        <p class="text-[22px] leading-snug tracking-[-0.01px]">
            After you claim, paste the agent prompt into your coding agent — it
            can set everything up for you.
        </p>
    </>
);

export const Start: FC<{
    base: string;
    invited: boolean;
}> = ({ base, invited }) => (
    <Layout
        title="Get started · tokenmaxer.quest"
        base={base}
    >
        {!invited && (
            <div class="mt-6 rounded-lg bg-panel2 px-4 py-3.5 text-sm text-text">
                Username claims are invite-only.{' '}
                <a href="mailto:jackmcpickle@gmail.com?subject=tokenmaxer.quest%20invite">
                    Email me
                </a>{' '}
                for an invite link.
            </div>
        )}

        <section class={hero}>
            <h1 class="reveal">Claim your name</h1>
            <p class={`${sub} reveal reveal-delay`}>
                Pick a username, get a token, let your agent set everything up.
                No email, no password — the token is your only credential, so
                keep it somewhere safe.
            </p>
        </section>

        {invited && (
            <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div
                    id="claim-panel"
                    class={panel}
                >
                    <form id="reg">
                        <label
                            class={field}
                            htmlFor="username"
                        >
                            <span class={fieldLbl}>
                                Username (2–32 chars: letters, numbers, _ or -)
                            </span>
                            <Input
                                variant="text"
                                id="username"
                                placeholder="e.g. tokenlord"
                                autocomplete="off"
                                required
                            />
                        </label>
                        <div
                            class="cf-turnstile mb-4"
                            data-sitekey={TURNSTILE_SITE_KEY}
                            data-theme="dark"
                        />
                        <Button
                            variant="primary"
                            type="submit"
                        >
                            Claim username
                        </Button>
                        <span
                            id="err"
                            class="ml-3 text-danger"
                        />
                    </form>
                </div>

                <aside class="spotlight spotlight-orange">{SETUP_TIP}</aside>
            </div>
        )}

        <div
            id="result"
            class="mt-6 hidden"
        >
            <div class={notice}>
                <strong>
                    Welcome, <span id="r-user" />.
                </strong>{' '}
                Your token is shown once — save it now. Lost tokens can&apos;t
                be recovered.
            </div>

            <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div class={panel}>
                    <h2 class="mt-0">Your token</h2>
                    <div class={copyrow}>
                        <pre id="r-token" />
                        <Button
                            variant="copy"
                            data-target="r-token"
                            type="button"
                        >
                            Copy
                        </Button>
                    </div>
                    <p class={`${sub} mt-4 mb-0`}>
                        <a
                            id="r-profile"
                            href="/"
                        >
                            View your profile →
                        </a>
                    </p>
                </div>

                <aside class="spotlight spotlight-magenta h-fit">
                    <p class="mb-3 text-[13px] font-medium tracking-[-0.13px] text-white/80">
                        Keep the token
                    </p>
                    <p class="text-[22px] leading-snug tracking-[-0.01px]">
                        Store it offline. There&apos;s no email recovery — the
                        hash on the server can&apos;t recreate the secret.
                    </p>
                </aside>
            </div>
        </div>

        <div
            class={
                invited
                    ? ''
                    : 'grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]'
            }
        >
            <div class={`${panel} min-w-0`}>
                <h2 class="mt-0">One-time setup</h2>
                <p class={muted}>
                    Downloads the reporter and writes your config (the token
                    lives here, never in shared settings). Run in a terminal:
                </p>
                <div class={copyrow}>
                    <pre id="r-setup" />
                    <Button
                        variant="copy"
                        data-target="r-setup"
                        type="button"
                    >
                        Copy
                    </Button>
                </div>

                <div class="mt-6 mb-4 flex flex-wrap border-b border-border">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            class={`tab${t.id === 'agent' ? ' tab-active' : ''}`}
                            type="button"
                            data-tab={t.id}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <div
                    id="tab-agent"
                    class="tab-panel"
                >
                    <p class={muted}>
                        Paste this into your coding agent — it will read the
                        start page and do the setup for you.
                    </p>
                    <div class={copyrow}>
                        <pre id="r-agent" />
                        <Button
                            variant="copy"
                            data-target="r-agent"
                            type="button"
                        >
                            Copy
                        </Button>
                    </div>
                </div>

                <div
                    id="tab-claude"
                    class="tab-panel hidden"
                >
                    <h2>Claude Code hooks</h2>
                    <p class={muted}>
                        Merge into <code>~/.claude/settings.json</code>:
                    </p>
                    <div class={copyrow}>
                        <pre id="r-claude" />
                        <Button
                            variant="copy"
                            data-target="r-claude"
                            type="button"
                        >
                            Copy
                        </Button>
                    </div>
                </div>

                <div
                    id="tab-codex"
                    class="tab-panel hidden"
                >
                    <h2>Codex hooks</h2>
                    <p class={muted}>
                        Add to <code>~/.codex/config.toml</code>. Codex has no
                        SessionEnd hook, so your latest session reports when you
                        next launch Codex.
                    </p>
                    <div class={copyrow}>
                        <pre id="r-codex" />
                        <Button
                            variant="copy"
                            data-target="r-codex"
                            type="button"
                        >
                            Copy
                        </Button>
                    </div>
                </div>

                <div
                    id="tab-opencode"
                    class="tab-panel hidden"
                >
                    <h2>opencode hook</h2>
                    <p class={muted}>
                        opencode has no shell hooks, so add a wrapper function
                        to your <code>~/.bashrc</code> or <code>~/.zshrc</code>.
                        It reports your latest sessions each time opencode
                        exits:
                    </p>
                    <div class={copyrow}>
                        <pre id="r-opencode" />
                        <Button
                            variant="copy"
                            data-target="r-opencode"
                            type="button"
                        >
                            Copy
                        </Button>
                    </div>
                </div>

                <div
                    id="tab-pi"
                    class="tab-panel hidden"
                >
                    <h2>pi hook</h2>
                    <p class={muted}>
                        Same idea for pi — add a wrapper function to your{' '}
                        <code>~/.bashrc</code> or <code>~/.zshrc</code>:
                    </p>
                    <div class={copyrow}>
                        <pre id="r-pi" />
                        <Button
                            variant="copy"
                            data-target="r-pi"
                            type="button"
                        >
                            Copy
                        </Button>
                    </div>
                </div>

                <div
                    id="tab-cursor"
                    class="tab-panel hidden"
                >
                    <h2>Cursor</h2>
                    <p class={muted}>
                        Cursor doesn&apos;t expose token usage to hooks, so the
                        reporter pulls your usage from Cursor&apos;s dashboard
                        API. It auto-reads your Cursor login from local storage
                        — no extra auth in the common case. Add this to{' '}
                        <code>~/.cursor/hooks.json</code> so every session
                        triggers a sync:
                    </p>
                    <div class={copyrow}>
                        <pre id="r-cursor" />
                        <Button
                            variant="copy"
                            data-target="r-cursor"
                            type="button"
                        >
                            Copy
                        </Button>
                    </div>
                    <p class={`${muted} mt-3 text-[13px]`}>
                        If auto-auth fails (Cursor not logged in on this
                        machine), copy the <code>WorkosCursorSessionToken</code>{' '}
                        cookie from cursor.com (DevTools → Application →
                        Cookies) into <code>~/.tokentally/config.json</code> as{' '}
                        <code>&quot;cursorCookie&quot;</code>. This uses an
                        unofficial Cursor endpoint, so the cookie may
                        occasionally need refreshing.
                    </p>
                </div>

                <h2>Backfill past history (optional)</h2>
                <p class={muted}>
                    The hooks only report new sessions. To load everything you
                    ran before installing tokenmaxer.quest, run this once — it
                    scans all your local Claude Code, Codex, opencode, pi and
                    Cursor history and uploads it (idempotent, so it&apos;s safe
                    to re-run). Add <code>claude</code>, <code>codex</code>,{' '}
                    <code>opencode</code>, <code>pi</code> or{' '}
                    <code>cursor</code> to limit it to one tool:
                </p>
                <div class={copyrow}>
                    <pre id="r-backfill">
                        node ~/.tokentally/tokentally.mjs backfill
                    </pre>
                    <Button
                        variant="copy"
                        data-target="r-backfill"
                        type="button"
                    >
                        Copy
                    </Button>
                </div>
            </div>
            {!invited && (
                <aside class="spotlight spotlight-orange h-fit">
                    {SETUP_TIP}
                </aside>
            )}
        </div>

        <script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            async
            defer
        />
        {/* eslint-disable-next-line */}
        <script dangerouslySetInnerHTML={{ __html: clientScript(base) }} />
    </Layout>
);
