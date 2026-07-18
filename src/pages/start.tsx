import type { FC } from 'hono/jsx';
import { Layout } from '@/pages/layout';

function clientScript(base: string): string {
    return `
const BASE = ${JSON.stringify(base)} || location.origin;
const form = document.getElementById('reg');
const err = document.getElementById('err');
const result = document.getElementById('result');

function esc(s){ return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

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
  return { setup, claude, codex };
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
    document.getElementById('r-profile').href = '/u/' + data.username;
    result.style.display = 'block';
    form.style.display = 'none';
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
    <Layout title="Get started · TokenTally" base={base}>
        <h1>Join the board</h1>
        <p class="sub">
            Pick a username, get a token, paste two snippets. No email, no password — the token is
            your only credential, so keep it somewhere safe.
        </p>

        <div class="panel">
            <form id="reg">
                <label class="field">
                    <span class="lbl">Username (2–32 chars: letters, numbers, _ or -)</span>
                    <input
                        id="username"
                        type="text"
                        placeholder="e.g. tokenlord"
                        autocomplete="off"
                        required
                    />
                </label>
                <button type="submit">Claim username</button>
                <span id="err" class="muted" style="color:#ff8080; margin-left:12px" />
            </form>

            <div id="result" style="display:none">
                <div class="notice">
                    <strong>
                        Welcome, <span id="r-user" />.
                    </strong>{' '}
                    Your token is shown once — save it now. Lost tokens can't be recovered.
                </div>

                <h2>Your token</h2>
                <div class="copyrow">
                    <pre id="r-token" />
                    <button class="copy ghost" data-target="r-token" type="button">
                        Copy
                    </button>
                </div>

                <h2>1. One-time setup</h2>
                <p class="muted">
                    Downloads the reporter and writes your config (the token lives here, never in
                    shared settings). Run in a terminal:
                </p>
                <div class="copyrow">
                    <pre id="r-setup" />
                    <button class="copy ghost" data-target="r-setup" type="button">
                        Copy
                    </button>
                </div>

                <h2>2a. Claude Code hooks</h2>
                <p class="muted">
                    Merge into <code>~/.claude/settings.json</code>:
                </p>
                <div class="copyrow">
                    <pre id="r-claude" />
                    <button class="copy ghost" data-target="r-claude" type="button">
                        Copy
                    </button>
                </div>

                <h2>2b. Codex hooks</h2>
                <p class="muted">
                    Add to <code>~/.codex/config.toml</code>. Codex has no SessionEnd hook, so your
                    latest session reports when you next launch Codex.
                </p>
                <div class="copyrow">
                    <pre id="r-codex" />
                    <button class="copy ghost" data-target="r-codex" type="button">
                        Copy
                    </button>
                </div>

                <p class="sub" style="margin-top:24px">
                    That's it. <a id="r-profile" href="/">View your profile →</a>
                </p>
            </div>
        </div>

        {/* eslint-disable-next-line */}
        <script dangerouslySetInnerHTML={{ __html: clientScript(base) }} />
    </Layout>
);
