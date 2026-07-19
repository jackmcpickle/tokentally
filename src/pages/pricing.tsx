import type { FC } from 'hono/jsx';
import { listPrices } from '@/lib/pricing';
import { Layout } from '@/pages/layout';
import { hero, num, panel, sub } from '@/pages/ui';

/** USD/MTok rates — keep full precision (unlike board totals via formatUsd). */
function perMillion(n: number): string {
    return `$${n} / M`;
}

export const Pricing: FC<{ base: string }> = ({ base }) => (
    <Layout
        title="Pricing · tokenmaxer.quest"
        base={base}
    >
        <section class={hero}>
            <h1 class="reveal">Reference pricing</h1>
            <p class={`${sub} reveal reveal-delay`}>
                Estimated USD per million tokens used for the leaderboard cost
                metric. Matching is by longest substring of the model id — these
                are approximations, not invoices.
            </p>
        </section>

        <div class={`${panel} overflow-x-auto`}>
            <table class="min-w-xl">
                <thead>
                    <tr>
                        <th>Model id</th>
                        <th class={num}>Input</th>
                        <th class={num}>Output</th>
                        <th class={num}>Cache read</th>
                        <th class={num}>Cache write</th>
                    </tr>
                </thead>
                <tbody>
                    {listPrices().map((p) => (
                        <tr key={p.id}>
                            <td>
                                <code>{p.id}</code>
                            </td>
                            <td class={num}>{perMillion(p.input)}</td>
                            <td class={num}>{perMillion(p.output)}</td>
                            <td class={num}>{perMillion(p.cacheRead)}</td>
                            <td class={num}>{perMillion(p.cacheWrite)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        <p class="mt-6 max-w-[65ch] text-[13px] leading-snug text-muted">
            Unknown models fall back to a conservative Sonnet-like rate ($3 /
            $15 / $0.30 / $3.75 per million). Rates live in{' '}
            <code>src/lib/pricing.ts</code> and update when the site is
            redeployed.
        </p>
    </Layout>
);
