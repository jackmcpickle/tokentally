import { describe, expect, it } from 'vitest';
import {
    estimateImpact,
    formatHouseholdPercent,
    formatImpact,
    householdBaseline,
    householdPercent,
    householdWindowDays,
    impactValue,
    parseImpactMetric,
    parseImpactRegion,
    parseImpactScenario,
} from '@/lib/impact';

describe('estimateImpact', () => {
    it('matches TokenWater central/global hand calc for 1e6 tokens', () => {
        // E_IT = 1e6 * 2 / 3.6e6 = 5/9 kWh
        // E_fac = 1.2 * 5/9 = 2/3 kWh
        // W = 0.4*(5/9) + 4.81*(2/3)
        // CO2 = (2/3) * 475 / 1000
        const est = estimateImpact(1_000_000, 'central', 'global');
        expect(est.energy_kwh).toBeCloseTo(2 / 3, 10);
        expect(est.water_l).toBeCloseTo(0.4 * (5 / 9) + 4.81 * (2 / 3), 10);
        expect(est.co2_kg).toBeCloseTo(((2 / 3) * 475) / 1000, 10);
    });

    it('orders Low < Central < High for the same tokens', () => {
        const low = estimateImpact(500_000, 'low', 'global');
        const mid = estimateImpact(500_000, 'central', 'global');
        const high = estimateImpact(500_000, 'high', 'global');
        expect(low.energy_kwh).toBeLessThan(mid.energy_kwh);
        expect(mid.energy_kwh).toBeLessThan(high.energy_kwh);
        expect(low.water_l).toBeLessThan(mid.water_l);
        expect(mid.water_l).toBeLessThan(high.water_l);
        expect(low.co2_kg).toBeLessThan(mid.co2_kg);
        expect(mid.co2_kg).toBeLessThan(high.co2_kg);
    });

    it('uses AU-specific grid water and carbon vs Global', () => {
        const global = estimateImpact(1_000_000, 'central', 'global');
        const au = estimateImpact(1_000_000, 'central', 'au');
        expect(au.energy_kwh).toBeCloseTo(global.energy_kwh, 10);
        expect(au.water_l).not.toBeCloseTo(global.water_l, 3);
        expect(au.co2_kg).not.toBeCloseTo(global.co2_kg, 3);
        // AU water factor 4.26 < global 4.81 → less water at same scenario
        expect(au.water_l).toBeLessThan(global.water_l);
        // AU carbon 634 > global 475
        expect(au.co2_kg).toBeGreaterThan(global.co2_kg);
    });

    it('treats negative tokens as zero', () => {
        const est = estimateImpact(-100, 'central', 'global');
        expect(est.energy_kwh).toBe(0);
        expect(est.water_l).toBe(0);
        expect(est.co2_kg).toBe(0);
    });
});

describe('household baselines', () => {
    it('scales 7d energy as annual × 7/365', () => {
        const day7 = householdBaseline('us', '7d', 'energy');
        expect(day7).toBeCloseTo((10_500 * 7) / 365, 10);
        expect(day7).toBeCloseTo(
            householdBaseline('us', '30d', 'energy') * (7 / 30),
            10,
        );
    });

    it('uses 30d household for the all window', () => {
        expect(householdWindowDays('all')).toBe(30);
        expect(householdBaseline('au', 'all', 'water')).toBeCloseTo(
            householdBaseline('au', '30d', 'water'),
            10,
        );
    });

    it('computes household percent and formats all-window label', () => {
        const hh = householdBaseline('global', '7d', 'energy');
        const est = estimateImpact(1_000_000, 'central', 'global');
        const pct = householdPercent(est.energy_kwh, hh);
        expect(pct).toBeCloseTo((est.energy_kwh / hh) * 100, 10);
        expect(formatHouseholdPercent(pct, '7d')).toMatch(/of household$/u);
        expect(formatHouseholdPercent(8.2, 'all')).toBe(
            '8.2% of 30d household',
        );
        expect(formatHouseholdPercent(1500, '7d')).toBe('>999% of household');
    });
});

describe('formatImpact + parsers', () => {
    it('formats small and large units', () => {
        expect(formatImpact('energy', 0.5)).toBe('500 Wh');
        expect(formatImpact('water', 0.25)).toBe('250 mL');
        expect(formatImpact('co2', 0.012)).toBe('12 g');
        expect(formatImpact('energy', 12.34)).toMatch(/kWh$/u);
    });

    it('defaults invalid query params', () => {
        expect(parseImpactScenario('nope')).toBe('central');
        expect(parseImpactMetric(undefined)).toBe('energy');
        expect(parseImpactRegion('au')).toBe('au');
    });

    it('picks the active metric value', () => {
        const est = estimateImpact(10_000, 'central', 'eu');
        expect(impactValue(est, 'energy')).toBe(est.energy_kwh);
        expect(impactValue(est, 'water')).toBe(est.water_l);
        expect(impactValue(est, 'co2')).toBe(est.co2_kg);
    });
});
