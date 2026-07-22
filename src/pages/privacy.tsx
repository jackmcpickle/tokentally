import type { FC } from 'hono/jsx';
import { Button } from '@/pages/components/button';
import { Layout } from '@/pages/layout';
import { hero, heroActions, sub } from '@/pages/ui';

export const Privacy: FC<{ base: string }> = ({ base }) => (
    <Layout
        title="Privacy · tokenmaxer.quest"
        base={base}
        description="What tokenmaxer.quest stores about your coding sessions — and what it never stores."
    >
        <section class={hero}>
            <h1 class="reveal">Privacy</h1>
            <p class={`${sub} reveal reveal-delay`}>
                We keep the bare minimum to run a token leaderboard, and nothing
                that could reveal what you were building.
            </p>
        </section>

        <div class="mx-auto max-w-[65ch]">
            <h2>What we store</h2>
            <ul class="mb-6 list-disc space-y-2 pl-5 text-muted">
                <li>
                    <strong class="text-text">Username</strong> — the public
                    name you chose.
                </li>
                <li>
                    <strong class="text-text">Country</strong> — an ISO country
                    code you pick at signup, shown on your profile and used for
                    the country leaderboard filter.
                </li>
                <li>
                    <strong class="text-text">Per-session token counts</strong>{' '}
                    — input, output, cache read, cache write and reasoning
                    tokens, broken down by model and tool (Claude Code, Codex,
                    opencode, pi, Cursor), plus the session id and timestamp.
                </li>
                <li>
                    <strong class="text-text">Optional profile URL</strong> — an{' '}
                    <code>https:</code> link you may add; clearing it removes
                    the link.
                </li>
                <li>
                    <strong class="text-text">
                        A SHA-256 hash of your token
                    </strong>{' '}
                    — never the token itself.
                </li>
                <li>
                    <strong class="text-text">A transient IP</strong> — used
                    only for short-lived rate limiting, not stored with your
                    account.
                </li>
            </ul>

            <h2>What we never store</h2>
            <ul class="mb-6 list-disc space-y-2 pl-5 text-muted">
                <li>Prompts, code, diffs, or file paths.</li>
                <li>Email addresses or passwords.</li>
                <li>Your raw token — only its hash lives on the server.</li>
                <li>
                    Any content from your sessions beyond the numeric token
                    totals described above.
                </li>
            </ul>
        </div>

        <aside class="spotlight spotlight-coral mx-auto my-12 max-w-[720px]">
            <p class="mb-3 text-[13px] font-medium tracking-[-0.13px] text-white/80">
                The token is your only key
            </p>
            <p class="text-[22px] leading-snug tracking-[-0.01px]">
                There&apos;s no email and no password, so there&apos;s no
                recovery. The server keeps only a hash and can&apos;t recreate
                the secret. If you lose the token, that username is stranded —
                rotate it while you still hold it, or email us and we&apos;ll
                help sort it out.
            </p>
        </aside>

        <div class="mx-auto max-w-[65ch]">
            <h2>Honor system</h2>
            <p class="mb-6 text-muted">
                Token counts are self-reported from your own machine, so this is
                an honor system with light guardrails — token-gated writes, rate
                limits, and sanity caps. See the <a href="/about">about page</a>{' '}
                for how the numbers are read and summed.
            </p>

            <h2>Contact</h2>
            <p class="mb-6 text-muted">
                Questions, a lost token, or a data request? Email{' '}
                <a href="mailto:jackmcpickle@gmail.com?subject=tokenmaxer.quest%20privacy">
                    jackmcpickle@gmail.com
                </a>
                .
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
