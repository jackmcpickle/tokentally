import type { FC } from 'hono/jsx';
import { Button } from '@/pages/components/button';
import { Layout } from '@/pages/layout';
import { hero, heroActions, sub } from '@/pages/ui';

export const About: FC<{ base: string }> = ({ base }) => (
    <Layout
        title="About · tokenmaxer.quest"
        base={base}
    >
        <section class={hero}>
            <h1 class="reveal">About tokenmaxer.quest</h1>
            <p class={`${sub} reveal reveal-delay`}>
                A public leaderboard of tokens burned by AI builders — nothing
                more.
            </p>
        </section>

        <div class="mx-auto max-w-[65ch]">
            <h2>What it tracks</h2>
            <p class="mb-6 text-muted">
                For each coding session, tokenmaxer.quest stores only token
                counts — input, output, cache read, cache write, and (for Codex)
                reasoning tokens — broken down by model and by tool (Claude Code
                or Codex). That&apos;s it. No prompts, no code, no file paths,
                no email, no IP beyond transient rate-limiting. The leaderboard
                can rank by total tokens, input+output, output only, or
                estimated cost.
            </p>

            <h2>Where the numbers come from</h2>
            <p class="mb-4 text-muted">
                Claude Code and Codex both write a local transcript for every
                session. The reporter reads those files — the same ones the
                community tool <code>ccusage</code> parses — sums the usage per
                model, and posts the totals. Hook payloads themselves don&apos;t
                contain token counts, so the reporter reads the transcript the
                hook points it at:
            </p>
            <ul class="mb-6 list-disc space-y-2 pl-5 text-muted">
                <li>
                    <strong class="text-text">Claude Code:</strong>{' '}
                    <code>~/.claude/projects/**/&lt;session&gt;.jsonl</code> —
                    the <code>usage</code> block on each assistant message.
                </li>
                <li>
                    <strong class="text-text">Codex:</strong>{' '}
                    <code>~/.codex/sessions/**/rollout-*.jsonl</code> — the last{' '}
                    <code>token_count</code> event per session.
                </li>
            </ul>
            <p class="mb-6 text-muted">
                Reporting is triggered by{' '}
                <strong class="text-text">SessionStart</strong> and{' '}
                <strong class="text-text">SessionEnd</strong> hooks — no
                background daemon, no cron. Because each session is keyed by its
                id and the server overwrites rather than adds, re-reporting the
                same session never double-counts.
            </p>
        </div>

        <aside class="spotlight spotlight-coral mx-auto my-12 max-w-[720px]">
            <p class="mb-3 text-[13px] font-medium tracking-[-0.13px] text-white/80">
                The honest part
            </p>
            <p class="text-[22px] leading-snug tracking-[-0.01px]">
                Token counts are self-reported. There&apos;s no way to
                cryptographically prove numbers generated on someone&apos;s own
                machine, so this is an honor system. We apply light guardrails —
                token-gated writes, rate limits, and sanity caps — and keep raw
                session ids so blatant anomalies are auditable. Treat the
                ranking as fun, not audited fact.
            </p>
        </aside>

        <div class="mx-auto max-w-[65ch]">
            <h2>Accounts &amp; privacy</h2>
            <p class="mb-6 text-muted">
                You pick a username and get a secret token. The token is the
                only credential; we store just a SHA-256 hash of it, never the
                token itself. There&apos;s no email and no recovery — if you
                lose the token, that username is stranded (you can rotate the
                token while you still hold it). We keep no personally
                identifying information.
            </p>

            <div class={heroActions}>
                <Button
                    variant="primary"
                    href="/start"
                >
                    Get started
                </Button>
            </div>
        </div>
    </Layout>
);
