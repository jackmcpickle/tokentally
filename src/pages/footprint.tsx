import type { FC } from 'hono/jsx';
import { countryName, flagEmoji } from '@/lib/countries';
import {
    type ImpactMetric,
    type ImpactRegion,
    type ImpactScenario,
    IMPACT_METRIC_LABELS,
    IMPACT_REGION_LABELS,
    IMPACT_SCENARIO_LABELS,
} from '@/lib/impact';
import { familyLabel } from '@/lib/model-family';
import { Input } from '@/pages/components/input';
import {
    FootprintChart,
    type FootprintEntry,
    WINDOW_LABELS,
} from '@/pages/footprint-chart';
import { Layout } from '@/pages/layout';
import { filterLabel, filters, hero, sub } from '@/pages/ui';
import type { Source, TimeWindow } from '@/types';

const AUTO_SUBMIT = 'this.form.requestSubmit()';

const REFERENCES: readonly { href: string; title: string; usedFor: string }[] =
    [
        {
            href: 'https://tokenwater.org/methodology',
            title: 'TokenWater methodology',
            usedFor:
                'Equations, PUE/WUE, per-token energy ranges, grid water regions',
        },
        {
            href: 'https://tokenomy.ai/tools?tab=energy',
            title: 'Tokenomy Energy Estimator',
            usedFor:
                'Energy/CO₂ product framing; US delivered-electricity carbon convention',
        },
        {
            href: 'https://arxiv.org/abs/2304.03271',
            title: 'Li et al. 2023 — Making AI Less ‘Thirsty’',
            usedFor:
                'Water footprint methodology; AU offsite grid water factor',
        },
        {
            href: 'https://arxiv.org/abs/2407.14713',
            title: 'Ren 2024 — The Uneven Distribution of AI’s Environmental Impacts',
            usedFor: 'Regional grid water variation',
        },
        {
            href: 'https://iopscience.iop.org/article/10.1088/1748-9326/7/4/045802',
            title: 'Macknick et al. 2012 — Operational water factors for electricity',
            usedFor: 'Grid water intensity factors by generation technology',
        },
        {
            href: 'https://www.epa.gov/egrid/summary-data',
            title: 'EPA eGRID summary data',
            usedFor: 'US grid carbon rates',
        },
        {
            href: 'https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references',
            title: 'EPA GHG Equivalencies — calculations & references',
            usedFor:
                'Delivered electricity CO₂ (~394 g/kWh) and US home electricity context',
        },
        {
            href: 'https://www.epa.gov/watersense/statistics-and-facts',
            title: 'EPA WaterSense statistics',
            usedFor: 'US household water order-of-magnitude',
        },
        {
            href: 'https://www.eea.europa.eu/en/analysis/indicators/greenhouse-gas-emission-intensity-of-1',
            title: 'EEA — GHG emission intensity of electricity generation',
            usedFor: 'EU grid carbon context',
        },
        {
            href: 'https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Water_statistics',
            title: 'Eurostat — Water statistics',
            usedFor: 'EU household water (~40–50 m³ per person)',
        },
        {
            href: 'https://cer.gov.au/markets/reports-and-data/nger-reporting-data-and-registers/electricity-sector-emissions-and-generation-data-2024-25',
            title: 'CER — Electricity sector emissions & generation 2024–25',
            usedFor: 'AU NEM grid intensity (~634 gCO₂e/kWh)',
        },
        {
            href: 'https://www.abs.gov.au/statistics/environment/environmental-accounts/water-account-australia/latest-release',
            title: 'ABS — Water Account, Australia',
            usedFor: 'AU household water (~174 kL/year)',
        },
        {
            href: 'https://www.abs.gov.au/statistics/industry/energy/energy-account-australia/latest-release',
            title: 'ABS — Energy Account, Australia',
            usedFor: 'AU household energy context',
        },
    ];

interface FootprintProps {
    base: string;
    entries: FootprintEntry[];
    models: string[];
    countries: string[];
    window: TimeWindow;
    metric: ImpactMetric;
    scenario: ImpactScenario;
    region: ImpactRegion;
    source: Source | undefined;
    model: string | undefined;
    country: string | undefined;
}

export const Footprint: FC<FootprintProps> = (p) => (
    <Layout
        title="Footprint · tokenmaxer.quest"
        base={p.base}
    >
        <section class={hero}>
            <h1 class="reveal">Footprint</h1>
            <p class={`${sub} reveal reveal-delay`}>
                Estimated energy, water, and CO₂e from reported tokens. Ranked
                by{' '}
                <strong class="text-text">
                    {IMPACT_METRIC_LABELS[p.metric]}
                </strong>{' '}
                · {WINDOW_LABELS[p.window]} ·{' '}
                {IMPACT_SCENARIO_LABELS[p.scenario]} ·{' '}
                {IMPACT_REGION_LABELS[p.region]}. Estimates, not meters.
            </p>
        </section>

        <form
            class={filters}
            method="get"
            action="/footprint"
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
            <input
                type="hidden"
                name="scenario"
                value={p.scenario}
            />
            <input
                type="hidden"
                name="region"
                value={p.region}
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

        <FootprintChart
            entries={p.entries}
            window={p.window}
            metric={p.metric}
            scenario={p.scenario}
            region={p.region}
            source={p.source}
            model={p.model}
            country={p.country}
        />

        <section class="mx-auto mb-10 max-w-[65ch]">
            <h2 class="mb-3 text-xl font-extrabold tracking-[-0.02em]">
                How we estimate
            </h2>
            <p class="mb-4 text-muted">
                Token totals convert to IT energy, then facility energy via PUE.
                Water is site cooling (WUE) plus grid water. CO₂e uses the
                selected region&apos;s grid intensity. Low / Central / High vary
                PUE, WUE, and joules-per-token together — TokenWater&apos;s
                Unknown (wide) band, since coding agents mix models. See{' '}
                <a
                    href="https://tokenwater.org/methodology"
                    rel="noopener noreferrer"
                    target="_blank"
                >
                    TokenWater
                </a>{' '}
                and{' '}
                <a
                    href="https://tokenomy.ai/tools?tab=energy"
                    rel="noopener noreferrer"
                    target="_blank"
                >
                    Tokenomy Energy
                </a>
                .
            </p>
            <p class="mb-4 text-muted">
                Each row also shows percent of an average household framed as{' '}
                <strong class="text-text">two adults and two children</strong>{' '}
                for that region (electricity, water, or electricity-linked
                CO₂e). China and India household baselines are approximate
                order-of-magnitude fillers. For all-time rankings, household %
                uses a 30-day household denominator.
            </p>
            <p class="text-sm text-muted">
                Disclaimer: these are awareness estimates. Actual use varies by
                data center, cooling, hardware, batching, and where the model
                really runs. Low–High is real-world spread, not measurement
                error.
            </p>
        </section>

        <section
            class="mx-auto max-w-[65ch]"
            id="references"
        >
            <h2 class="mb-3 text-xl font-extrabold tracking-[-0.02em]">
                References
            </h2>
            <ul class="flex list-none flex-col gap-3 p-0">
                {REFERENCES.map(({ href, title, usedFor }) => (
                    <li key={href}>
                        <a
                            class="font-medium text-accent"
                            href={href}
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            {title}
                        </a>
                        <span class="mt-0.5 block text-sm text-muted">
                            {usedFor}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    </Layout>
);
