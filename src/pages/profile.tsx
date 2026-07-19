import type { FC } from 'hono/jsx';
import type { Profile } from '@/lib/aggregate';
import { formatDate, formatTokens, formatUsd } from '@/lib/format';
import { Button } from '@/pages/components/button';
import { Layout } from '@/pages/layout';
import {
    empty,
    hero,
    num,
    panel,
    pill,
    stat,
    statGrid,
    statK,
    statV,
} from '@/pages/ui';

const SOURCE_LABELS: Record<string, string> = {
    claude_code: 'Claude Code',
    codex: 'Codex',
    opencode: 'opencode',
    pi: 'pi',
    cursor: 'Cursor',
};

export const ProfilePage: FC<{ base: string; profile: Profile }> = ({
    base,
    profile: p,
}) => (
    <Layout
        title={`${p.username} · tokenmaxer.quest`}
        base={base}
    >
        <section class={hero}>
            <h1 class="reveal">{p.username}</h1>
            <p class="reveal reveal-delay mb-0 max-w-[52ch] text-[18px] leading-snug tracking-[-0.18px] text-muted">
                Rank #{p.rank} · joined {formatDate(p.created_at)} ·{' '}
                {p.sessions} sessions tracked
            </p>
        </section>

        <div class={`${statGrid} mb-10`}>
            <div class={stat}>
                <div class={statK}>Total tokens</div>
                <div class={statV}>{formatTokens(p.grand_total)}</div>
            </div>
            <div class={stat}>
                <div class={statK}>Input + output</div>
                <div class={statV}>
                    {formatTokens(p.input_tokens + p.output_tokens)}
                </div>
            </div>
            <div class={stat}>
                <div class={statK}>Output</div>
                <div class={statV}>{formatTokens(p.output_tokens)}</div>
            </div>
            <div class={stat}>
                <div class={statK}>Cache read</div>
                <div class={statV}>{formatTokens(p.cache_read_tokens)}</div>
            </div>
            <div class={stat}>
                <div class={statK}>Cache write</div>
                <div class={statV}>{formatTokens(p.cache_creation_tokens)}</div>
            </div>
            <div class={stat}>
                <div class={statK}>Est. cost</div>
                <div class={statV}>{formatUsd(p.cost)}</div>
            </div>
        </div>

        <h2 class="mt-0">By model</h2>
        <div class="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(240px,280px)]">
            <div class={`${panel} min-w-0`}>
                {p.breakdown.length === 0 ? (
                    <div class={empty}>No usage reported yet.</div>
                ) : (
                    <div class="overflow-x-auto">
                        <table class="min-w-xl">
                            <thead>
                                <tr>
                                    <th>Source</th>
                                    <th>Model</th>
                                    <th class={num}>Total</th>
                                    <th class={num}>Output</th>
                                    <th class={num}>Est. cost</th>
                                </tr>
                            </thead>
                            <tbody>
                                {p.breakdown.map((b) => (
                                    <tr key={`${b.source}:${b.model}`}>
                                        <td>
                                            <span class={pill}>
                                                {SOURCE_LABELS[b.source] ??
                                                    b.source}
                                            </span>
                                        </td>
                                        <td>
                                            <code>{b.model}</code>
                                        </td>
                                        <td class={num}>
                                            {formatTokens(
                                                b.input_tokens +
                                                    b.output_tokens +
                                                    b.cache_read_tokens +
                                                    b.cache_creation_tokens +
                                                    b.reasoning_tokens,
                                            )}
                                        </td>
                                        <td class={num}>
                                            {formatTokens(b.output_tokens)}
                                        </td>
                                        <td class={num}>{formatUsd(b.cost)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <aside class="spotlight spotlight-violet w-full md:h-fit">
                <p class="mb-3 text-[13px] font-medium tracking-[-0.13px] text-white/80">
                    Keep climbing
                </p>
                <p class="mb-6 text-[20px] leading-snug tracking-[-0.01px] sm:text-[22px]">
                    Back to the board, or claim another machine with the same
                    hooks.
                </p>
                <Button
                    variant="primary"
                    href="/"
                >
                    View leaderboard
                </Button>
            </aside>
        </div>
    </Layout>
);
