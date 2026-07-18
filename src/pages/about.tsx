import type { FC } from 'hono/jsx';
import { Layout } from '@/pages/layout';

export const About: FC<{ base: string }> = ({ base }) => (
    <Layout title="About · TokenTally" base={base}>
        <h1>About TokenTally</h1>
        <p class="sub">A public leaderboard of tokens burned by AI builders — nothing more.</p>

        <h2>What it tracks</h2>
        <p>
            For each coding session, TokenTally stores only token counts — input, output, cache
            read, cache write, and (for Codex) reasoning tokens — broken down by model and by tool
            (Claude Code or Codex). That's it. No prompts, no code, no file paths, no email, no IP
            beyond transient rate-limiting. The leaderboard can rank by total tokens, input+output,
            output only, or estimated cost.
        </p>

        <h2>Where the numbers come from</h2>
        <p>
            Claude Code and Codex both write a local transcript for every session. TokenTally's
            reporter reads those files — the same ones the community tool{' '}
            <code>ccusage</code> parses — sums the usage per model, and posts the totals. Hook
            payloads themselves don't contain token counts, so the reporter reads the transcript the
            hook points it at:
        </p>
        <ul>
            <li>
                <strong>Claude Code:</strong> <code>~/.claude/projects/**/&lt;session&gt;.jsonl</code>{' '}
                — the <code>usage</code> block on each assistant message.
            </li>
            <li>
                <strong>Codex:</strong> <code>~/.codex/sessions/**/rollout-*.jsonl</code> — the last{' '}
                <code>token_count</code> event per session.
            </li>
        </ul>
        <p>
            Reporting is triggered by <strong>SessionStart</strong> and <strong>SessionEnd</strong>{' '}
            hooks — no background daemon, no cron. Because each session is keyed by its id and the
            server overwrites rather than adds, re-reporting the same session never double-counts.
        </p>

        <h2>The honest part</h2>
        <p>
            Token counts are <strong>self-reported</strong>. There's no way to cryptographically
            prove numbers generated on someone's own machine, so this is an honor system. We apply
            light guardrails — token-gated writes, rate limits, and sanity caps — and keep raw
            session ids so blatant anomalies are auditable. Treat the ranking as fun, not audited
            fact.
        </p>

        <h2>Accounts &amp; privacy</h2>
        <p>
            You pick a username and get a secret token. The token is the only credential; we store
            just a SHA-256 hash of it, never the token itself. There's no email and no recovery — if
            you lose the token, that username is stranded (you can rotate the token while you still
            hold it). We keep no personally identifying information.
        </p>

        <p class="sub" style="margin-top:24px">
            <a href="/start">Get started →</a>
        </p>
    </Layout>
);
