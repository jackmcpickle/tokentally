import type { Child, FC } from 'hono/jsx';

const CSS = `
:root {
  --bg: #0b0d10; --panel: #14171c; --panel2: #1b1f26; --border: #262b33;
  --text: #e7eaee; --muted: #97a1af; --accent: #7c9cff; --accent2: #4ade80;
  --gold: #f5c451; --silver: #c7cdd6; --bronze: #d98a5b;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.wrap { max-width: 960px; margin: 0 auto; padding: 24px 20px 64px; }
header.site { display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 16px 0; border-bottom: 1px solid var(--border); margin-bottom: 28px; flex-wrap: wrap; }
.brand { font-weight: 800; font-size: 20px; letter-spacing: -0.02em; color: var(--text); }
.brand span { color: var(--accent); }
nav.site a { color: var(--muted); margin-left: 18px; font-weight: 500; }
nav.site a:hover { color: var(--text); }
h1 { font-size: 30px; letter-spacing: -0.02em; margin: 0 0 6px; }
h2 { font-size: 20px; margin: 32px 0 12px; }
.sub { color: var(--muted); margin: 0 0 24px; }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 18px; }
.filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
.filters label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
select, input[type=text] {
  background: var(--panel2); color: var(--text); border: 1px solid var(--border);
  border-radius: 8px; padding: 8px 10px; font-size: 14px; min-width: 130px;
}
button {
  background: var(--accent); color: #0b0d10; border: 0; border-radius: 8px;
  padding: 10px 16px; font-weight: 700; font-size: 14px; cursor: pointer;
}
button:hover { filter: brightness(1.08); }
button.ghost { background: var(--panel2); color: var(--text); border: 1px solid var(--border); }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 11px 12px; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tr:last-child td { border-bottom: 0; }
.rank { font-weight: 800; width: 44px; }
.rank.r1 { color: var(--gold); } .rank.r2 { color: var(--silver); } .rank.r3 { color: var(--bronze); }
.pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px;
  background: var(--panel2); border: 1px solid var(--border); color: var(--muted); }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.stat { background: var(--panel2); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
.stat .k { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
.stat .v { font-size: 24px; font-weight: 800; margin-top: 4px; font-variant-numeric: tabular-nums; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
pre { background: #0f1216; border: 1px solid var(--border); border-radius: 10px; padding: 14px;
  overflow-x: auto; font-size: 13px; }
.muted { color: var(--muted); }
.empty { color: var(--muted); padding: 24px; text-align: center; }
footer.site { margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--border);
  color: var(--muted); font-size: 13px; }
.token-box { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.copyrow { position: relative; }
.copyrow button.copy { position: absolute; top: 8px; right: 8px; padding: 5px 10px; font-size: 12px; }
label.field { display: block; margin: 14px 0; }
label.field .lbl { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.notice { background: rgba(124,156,255,0.08); border: 1px solid rgba(124,156,255,0.3);
  border-radius: 10px; padding: 12px 14px; margin: 16px 0; font-size: 14px; }
`;

export const Layout: FC<{ title: string; base: string; children?: Child }> = (props) => (
    <html lang="en">
        <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>{props.title}</title>
            <meta
                name="description"
                content="TokenTally — a public leaderboard of tokens burned by AI builders on Claude Code and Codex."
            />
            {/* eslint-disable-next-line */}
            <style dangerouslySetInnerHTML={{ __html: CSS }} />
        </head>
        <body>
            <div class="wrap">
                <header class="site">
                    <a class="brand" href="/">
                        Token<span>Tally</span>
                    </a>
                    <nav class="site">
                        <a href="/">Leaderboard</a>
                        <a href="/start">Get started</a>
                        <a href="/about">About</a>
                    </nav>
                </header>
                {props.children}
                <footer class="site">
                    <p>
                        TokenTally · self-reported, honor-system token counts from Claude Code &amp;
                        Codex · no PII stored · <a href="/about">how it works</a>
                    </p>
                </footer>
            </div>
        </body>
    </html>
);
