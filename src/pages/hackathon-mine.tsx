import type { FC } from 'hono/jsx';
import type { HackathonRow } from '@/lib/hackathon';
import { Button } from '@/pages/components/button';
import { Layout } from '@/pages/layout';
import { empty, hero, sub } from '@/pages/ui';

interface HackathonMineProps {
    base: string;
    username: string;
    hackathons: HackathonRow[];
}

export const HackathonMine: FC<HackathonMineProps> = (p) => (
    <Layout
        title="My hackathons · tokenmaxer.quest"
        base={p.base}
    >
        <section class={hero}>
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 class="wm">My hackathons</h1>
                    <p class={sub}>
                        Hosted by{' '}
                        <strong class="text-text">@{p.username}</strong>.
                    </p>
                </div>
                <Button
                    variant="primary"
                    href="/h/new"
                >
                    New hackathon
                </Button>
            </div>

            {p.hackathons.length === 0 ? (
                <div class={empty}>
                    No hackathons yet. <a href="/h/new">Create your first →</a>
                </div>
            ) : (
                <div class="mt-4 flex flex-col gap-2">
                    {p.hackathons.map((h) => (
                        <a
                            key={h.id}
                            href={`/h/${h.slug}`}
                            class="flex items-center justify-between rounded-lg border border-border bg-panel px-4 py-3 no-underline hover:bg-panel2"
                        >
                            <span class="font-semibold text-text">
                                {h.name}
                            </span>
                            <span class="text-xs text-muted">/h/{h.slug}</span>
                        </a>
                    ))}
                </div>
            )}
        </section>
    </Layout>
);
