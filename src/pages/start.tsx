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
  return { setup, claude, codex, opencode, pi };
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.textContent = '';
  const username = document.getElementById('username').value.trim();
  const btn = form.querySelector('button');
  btn.disabled = true; btn.textContent = 'Claiming…';
  try {
    const res = await fetch(BASE + '/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error || 'Registration failed'; return; }
    const s = snippets(data.username, data.token);
    document.getElementById('r-token').textContent = data.token;
    document.getElementById('r-user').textContent = data.username;
    document.getElementById('r-setup').textContent = s.setup;
    document.getElementById('r-claude').textContent = s.claude;
    document.getElementById('r-codex').textContent = s.codex;
    document.getElementById('r-opencode').textContent = s.opencode;
    document.getElementById('r-pi').textContent = s.pi;
    document.getElementById('r-profile').href = '/u/' + data.username;
    result.classList.remove('hidden');
    form.classList.add('hidden');
    document.getElementById('claim-panel')?.classList.add('hidden');
    result.scrollIntoView({ behavior: 'smooth' });
  } catch (e2) {
    err.textContent = 'Network error, please retry.';
  } finally {
    btn.disabled = false; btn.textContent = 'Claim username';
  }
});

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

export const Start: FC<{ base: string }> = ({ base }) => (
    <Layout
        title="Get started · tokenmaxer.quest"
        base={base}
    >
        <section class={hero}>
            <h1 class="reveal">Claim your name</h1>
            <p class={`${sub} reveal reveal-delay`}>
                Pick a username, get a token, paste two snippets. No email, no
                password — the token is your only credential, so keep it
                somewhere safe.
            </p>
        </section>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
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

            <aside class="spotlight spotlight-orange">
                <p class="mb-3 text-[13px] font-medium tracking-[-0.13px] text-white/80">
                    Setup tip
                </p>
                <p class="text-[22px] leading-snug tracking-[-0.01px]">
                    After you claim, copy the hook config into Claude Code,
                    Codex, opencode or pi. Sessions report themselves from
                    there.
                </p>
            </aside>
        </div>

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

            <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
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

                    <h2>1. One-time setup</h2>
                    <p class={muted}>
                        Downloads the reporter and writes your config (the token
                        lives here, never in shared settings). Run in a
                        terminal:
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

                    <h2>2a. Claude Code hooks</h2>
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

                    <h2>2b. Codex hooks</h2>
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

                    <h2>2c. opencode hook</h2>
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

                    <h2>2d. pi hook</h2>
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

                    <h2>3. Backfill past history (optional)</h2>
                    <p class={muted}>
                        The hooks only report new sessions. To load everything
                        you ran before installing tokenmaxer.quest, run this
                        once — it scans all your local Claude Code, Codex,
                        opencode and pi transcripts and uploads them
                        (idempotent, so it&apos;s safe to re-run). Add{' '}
                        <code>claude</code>, <code>codex</code>,{' '}
                        <code>opencode</code> or <code>pi</code> to limit it to
                        one tool:
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

                    <p class={`${sub} mt-8 mb-0`}>
                        That&apos;s it.{' '}
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

        {/* eslint-disable-next-line */}
        <script dangerouslySetInnerHTML={{ __html: clientScript(base) }} />
    </Layout>
);
