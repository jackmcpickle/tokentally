import type { FC } from 'hono/jsx';
import type { LeaderboardEntry } from '@/lib/aggregate';
import { countryName, flagEmoji } from '@/lib/countries';
import { familyLabel } from '@/lib/model-family';
import { Button } from '@/pages/components/button';
import { Input } from '@/pages/components/input';
import { Layout } from '@/pages/layout';
import {
    LeaderboardChart,
    METRIC_LABELS,
    WINDOW_LABELS,
} from '@/pages/leaderboard-chart';
import { filterLabel, filters, hero, heroActions, sub } from '@/pages/ui';
import type { Metric, Source, TimeWindow } from '@/types';

const AUTO_SUBMIT = 'this.form.requestSubmit()';

interface HomeProps {
    base: string;
    entries: LeaderboardEntry[];
    /** Bundled model family ids for the filter (e.g. `sonnet`). */
    models: string[];
    /** ISO country codes that have at least one reporting user. */
    countries: string[];
    window: TimeWindow;
    metric: Metric;
    source: Source | undefined;
    model: string | undefined;
    country: string | undefined;
}

export const Home: FC<HomeProps> = (p) => (
    <Layout
        title="tokenmaxer.quest — token leaderboard for AI builders"
        base={p.base}
    >
        <section class={hero}>
            <h1 class="reveal wm">
                token<span class="max">maxer</span>
                <span class="tld">.quest</span>
            </h1>
            <p class={`${sub} reveal reveal-delay`}>
                The token leaderboard for Claude Code, Codex, opencode &amp; pi.
                Ranked by{' '}
                <strong class="text-text">{METRIC_LABELS[p.metric]}</strong> ·{' '}
                {WINDOW_LABELS[p.window]}.
            </p>
            <div class={`${heroActions} reveal reveal-delay-2`}>
                <Button
                    variant="primary"
                    href="/start"
                >
                    Claim a username
                </Button>
            </div>
        </section>

        <form
            class={filters}
            method="get"
            action="/"
        >
            <input
                type="hidden"
                name="window"
                value={p.window}
            />
            <input
                type="hidden"
                name="metric"
                value={p.metric}
            />
            <label
                class={filterLabel}
                htmlFor="filter-source"
            >
                Source
                <Input
                    variant="select"
                    id="filter-source"
                    name="source"
                    onchange={AUTO_SUBMIT}
                >
                    <option
                        value=""
                        selected={!p.source}
                    >
                        All
                    </option>
                    <option
                        value="claude_code"
                        selected={p.source === 'claude_code'}
                    >
                        Claude Code
                    </option>
                    <option
                        value="codex"
                        selected={p.source === 'codex'}
                    >
                        Codex
                    </option>
                    <option
                        value="opencode"
                        selected={p.source === 'opencode'}
                    >
                        opencode
                    </option>
                    <option
                        value="pi"
                        selected={p.source === 'pi'}
                    >
                        pi
                    </option>
                    <option
                        value="cursor"
                        selected={p.source === 'cursor'}
                    >
                        Cursor
                    </option>
                </Input>
            </label>
            <label
                class={filterLabel}
                htmlFor="filter-model"
            >
                Model
                <Input
                    variant="select"
                    id="filter-model"
                    name="model"
                    onchange={AUTO_SUBMIT}
                >
                    <option
                        value=""
                        selected={!p.model}
                    >
                        All
                    </option>
                    {p.models.map((m) => (
                        <option
                            key={m}
                            value={m}
                            selected={m === p.model}
                        >
                            {familyLabel(m)}
                        </option>
                    ))}
                </Input>
            </label>
            {p.countries.length > 0 && (
                <label
                    class={filterLabel}
                    htmlFor="filter-country"
                >
                    Country
                    <Input
                        variant="select"
                        id="filter-country"
                        name="country"
                        onchange={AUTO_SUBMIT}
                    >
                        <option
                            value=""
                            selected={!p.country}
                        >
                            All
                        </option>
                        {p.countries.map((code) => (
                            <option
                                key={code}
                                value={code}
                                selected={code === p.country}
                            >
                                {`${flagEmoji(code)} ${countryName(code)}`}
                            </option>
                        ))}
                    </Input>
                </label>
            )}
        </form>

        <LeaderboardChart
            entries={p.entries}
            window={p.window}
            metric={p.metric}
            source={p.source}
            model={p.model}
            country={p.country}
        />

        <aside class="spotlight spotlight-violet mt-4 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
                <p class="mb-2 text-[13px] font-medium tracking-[-0.13px] text-white/80">
                    Join the board
                </p>
                <p class="text-[22px] leading-snug tracking-[-0.01px] sm:text-[24px]">
                    Claim a username and start reporting sessions from Claude
                    Code, Codex, opencode or pi.
                </p>
            </div>
            <Button
                variant="primary"
                class="shrink-0"
                href="/start"
            >
                Get started
            </Button>
        </aside>
    </Layout>
);
