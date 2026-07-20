import type { TimeWindow } from '@/types';

/** Joules per token — TokenWater “Unknown (Wide Range)”. */
const J_PER_TOKEN = { low: 0.3, central: 2, high: 10 } as const;

const PUE = { low: 1.1, central: 1.2, high: 1.6 } as const;
const WUE_SITE = { low: 0.01, central: 0.4, high: 1 } as const;

export type ImpactScenario = 'low' | 'central' | 'high';
export type ImpactMetric = 'energy' | 'water' | 'co2';
export type ImpactRegion =
    | 'global'
    | 'us'
    | 'eu'
    | 'china'
    | 'india'
    | 'au'
    | 'low_water';

export const IMPACT_SCENARIOS: readonly ImpactScenario[] = [
    'low',
    'central',
    'high',
] as const;

export const IMPACT_METRICS: readonly ImpactMetric[] = [
    'energy',
    'water',
    'co2',
] as const;

export const IMPACT_REGIONS: readonly ImpactRegion[] = [
    'global',
    'us',
    'eu',
    'china',
    'india',
    'au',
    'low_water',
] as const;

export const IMPACT_SCENARIO_LABELS: Record<ImpactScenario, string> = {
    low: 'Low',
    central: 'Central',
    high: 'High',
};

export const IMPACT_METRIC_LABELS: Record<ImpactMetric, string> = {
    energy: 'Energy',
    water: 'Water',
    co2: 'CO₂e',
};

export const IMPACT_REGION_LABELS: Record<ImpactRegion, string> = {
    global: 'Global',
    us: 'US',
    eu: 'EU',
    china: 'China',
    india: 'India',
    au: 'AU',
    low_water: 'Low-water DC',
};

interface RegionFactors {
    /** Grid water consumption L/kWh of facility energy. */
    w_grid: number;
    /** Grid carbon intensity gCO₂e/kWh. */
    g_co2_per_kwh: number;
    /** Family-of-4 household electricity kWh/year. */
    household_kwh_yr: number;
    /** Family-of-4 household water L/year. */
    household_water_l_yr: number;
}

const REGIONS: Record<ImpactRegion, RegionFactors> = {
    global: {
        w_grid: 4.81,
        g_co2_per_kwh: 475,
        household_kwh_yr: 3_500,
        household_water_l_yr: 150_000,
    },
    us: {
        w_grid: 5.19,
        g_co2_per_kwh: 394,
        household_kwh_yr: 10_500,
        household_water_l_yr: 370_000,
    },
    eu: {
        w_grid: 3.22,
        g_co2_per_kwh: 300,
        household_kwh_yr: 3_500,
        household_water_l_yr: 180_000,
    },
    china: {
        w_grid: 6.02,
        g_co2_per_kwh: 550,
        household_kwh_yr: 2_500,
        household_water_l_yr: 140_000,
    },
    india: {
        w_grid: 3.45,
        g_co2_per_kwh: 650,
        household_kwh_yr: 1_200,
        household_water_l_yr: 120_000,
    },
    au: {
        w_grid: 4.26,
        g_co2_per_kwh: 634,
        household_kwh_yr: 5_700,
        household_water_l_yr: 174_000,
    },
    low_water: {
        w_grid: 0.2,
        g_co2_per_kwh: 200,
        household_kwh_yr: 3_500,
        household_water_l_yr: 150_000,
    },
};

export interface ImpactEstimate {
    energy_kwh: number;
    water_l: number;
    co2_kg: number;
}

export function isImpactScenario(v: unknown): v is ImpactScenario {
    return (
        typeof v === 'string' && IMPACT_SCENARIOS.includes(v as ImpactScenario)
    );
}

export function isImpactMetric(v: unknown): v is ImpactMetric {
    return typeof v === 'string' && IMPACT_METRICS.includes(v as ImpactMetric);
}

export function isImpactRegion(v: unknown): v is ImpactRegion {
    return typeof v === 'string' && IMPACT_REGIONS.includes(v as ImpactRegion);
}

export function parseImpactScenario(v: string | undefined): ImpactScenario {
    return isImpactScenario(v) ? v : 'central';
}

export function parseImpactMetric(v: string | undefined): ImpactMetric {
    return isImpactMetric(v) ? v : 'energy';
}

export function parseImpactRegion(v: string | undefined): ImpactRegion {
    return isImpactRegion(v) ? v : 'global';
}

export function estimateImpact(
    tokens: number,
    scenario: ImpactScenario,
    region: ImpactRegion,
): ImpactEstimate {
    const safeTokens = Math.max(0, tokens);
    // E_IT (kWh) → facility energy via PUE; water = site WUE + grid.
    const itKwh = (safeTokens * J_PER_TOKEN[scenario]) / 3_600_000;
    const facilityKwh = PUE[scenario] * itKwh;
    const factors = REGIONS[region];
    return {
        energy_kwh: facilityKwh,
        water_l: WUE_SITE[scenario] * itKwh + factors.w_grid * facilityKwh,
        co2_kg: (facilityKwh * factors.g_co2_per_kwh) / 1000,
    };
}

export function impactValue(est: ImpactEstimate, metric: ImpactMetric): number {
    switch (metric) {
        case 'energy':
            return est.energy_kwh;
        case 'water':
            return est.water_l;
        case 'co2':
            return est.co2_kg;
        default: {
            const exhaustive: never = metric;
            return exhaustive;
        }
    }
}

/** Days in the household comparison window (`all` → 30). */
export function householdWindowDays(window: TimeWindow): number {
    switch (window) {
        case 'today':
            return 1;
        case '7d':
            return 7;
        case '30d':
        case 'all':
            return 30;
        default: {
            const exhaustive: never = window;
            return exhaustive;
        }
    }
}

/** Household baseline in the same units as the impact metric, for the window. */
export function householdBaseline(
    region: ImpactRegion,
    window: TimeWindow,
    metric: ImpactMetric,
): number {
    const factors = REGIONS[region];
    const days = householdWindowDays(window);
    const kwh = (factors.household_kwh_yr * days) / 365;
    switch (metric) {
        case 'energy':
            return kwh;
        case 'water':
            return (factors.household_water_l_yr * days) / 365;
        case 'co2':
            return (kwh * factors.g_co2_per_kwh) / 1000;
        default: {
            const exhaustive: never = metric;
            return exhaustive;
        }
    }
}

/** Percent of household (0–∞). Returns 0 when household baseline is 0. */
export function householdPercent(impact: number, household: number): number {
    if (household <= 0) return 0;
    return (impact / household) * 100;
}

function trimNum(n: number, digits: number): string {
    if (digits <= 0) return String(Math.round(n));
    return n
        .toFixed(digits)
        .replace(/(\.\d*?)0+$/u, '$1')
        .replace(/\.$/u, '');
}

function formatScaled(n: number, unit: string): string {
    return `${trimNum(n, n < 10 ? 2 : 1)} ${unit}`;
}

export function formatImpact(metric: ImpactMetric, n: number): string {
    switch (metric) {
        case 'energy':
            return n < 1
                ? `${trimNum(n * 1000, 1)} Wh`
                : formatScaled(n, 'kWh');
        case 'water':
            return n < 1 ? `${trimNum(n * 1000, 0)} mL` : formatScaled(n, 'L');
        case 'co2':
            return n < 1 ? `${trimNum(n * 1000, 0)} g` : formatScaled(n, 'kg');
        default: {
            const exhaustive: never = metric;
            return exhaustive;
        }
    }
}

export function formatHouseholdPercent(
    pct: number,
    window: TimeWindow,
): string {
    const body =
        pct > 999
            ? '>999%'
            : `${pct >= 10 ? Math.round(pct) : trimNum(pct, 1)}%`;
    const suffix = window === 'all' ? ' of 30d household' : ' of household';
    return `${body}${suffix}`;
}
