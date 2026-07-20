import { describe, expect, it } from 'vitest';
import { stubKv } from '@/__tests__/helpers/kv';
import app from '@/index';
import type { Env } from '@/types';

function emptyDb(): D1Database {
    const empty = { results: [] as unknown[] };
    return {
        prepare() {
            return {
                bind() {
                    return this;
                },
                all: async () => empty,
                first: async () => null,
            };
        },
    } as unknown as D1Database;
}

function env(): Env {
    return {
        DB: emptyDb(),
        RATE_LIMIT: stubKv(),
        ENVIRONMENT: 'test',
        PUBLIC_BASE_URL: 'https://tokenmaxer.quest',
        TURNSTYLE_SECRET_KEY: '',
    };
}

const browserHeaders = {
    Accept: 'text/html',
    'Sec-Fetch-Mode': 'navigate',
};

describe('/footprint page', () => {
    it('renders chart controls, household copy, and references', async () => {
        const res = await app.request(
            'https://tokenmaxer.quest/footprint',
            { headers: browserHeaders },
            env(),
        );
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('Footprint');
        expect(html).toContain('Ranked by energy');
        expect(html).toContain('Scenario');
        expect(html).toContain('Region');
        expect(html).toContain('id="references"');
        expect(html).toContain('https://tokenwater.org/methodology');
        expect(html).toContain('https://tokenomy.ai/tools?tab=energy');
        expect(html).toContain(
            'https://cer.gov.au/markets/reports-and-data/nger-reporting-data-and-registers/electricity-sector-emissions-and-generation-data-2024-25',
        );
        expect(html).toContain('two adults and two children');
    });

    it('accepts impact query params', async () => {
        const res = await app.request(
            'https://tokenmaxer.quest/footprint?metric=water&scenario=high&region=au&window=30d',
            { headers: browserHeaders },
            env(),
        );
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('Ranked by water');
        expect(html).toContain('High');
        expect(html).toContain('>AU<');
    });

    it('links Footprint from the footer on Home', async () => {
        const res = await app.request(
            'https://tokenmaxer.quest/',
            { headers: browserHeaders },
            env(),
        );
        const html = await res.text();
        expect(html).toContain('href="/footprint"');
        expect(html).toContain('Footprint');
    });
});
