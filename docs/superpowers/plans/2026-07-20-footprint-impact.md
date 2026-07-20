# Footprint Impact Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/footprint` — Home-style SVG leaderboard ranked by estimated energy, water, and CO₂e from tokens, with scenario/region controls, household %, footer link, and validated References.

**Architecture:** Pure `src/lib/impact.ts` converts `grand_total` tokens → impact. New page + chart reuse `cachedLeaderboard` then re-sort. Home untouched.

**Tech Stack:** Hono JSX, Cloudflare Workers/D1/KV, Vitest

## Global Constraints

- Estimate-not-meter disclaimer required
- TokenWater Unknown J/token band + Low/Central/High scenarios
- Regions include AU; Global default
- Household = family of 4; `%` on each row; `all` uses 30d household
- References: only HTTP 200 links from the design spec
- No commit unless the user asks (override plan commit steps)
- Home ranking/UI unchanged

---

## File map

| File                                   | Role                                                        |
| -------------------------------------- | ----------------------------------------------------------- |
| `src/lib/impact.ts`                    | Constants, estimateImpact, household %, formatters, parsers |
| `src/__tests__/impact.test.ts`         | Unit tests for math + household                             |
| `src/pages/footprint-chart.tsx`        | Chart + window/metric/scenario/region                       |
| `src/pages/footprint.tsx`              | Page: hero, filters, chart, methodology, references         |
| `src/index.tsx`                        | `GET /footprint`                                            |
| `src/pages/layout.tsx`                 | Footer link                                                 |
| `src/__tests__/footprint-page.test.ts` | Route HTML smoke (footer + references)                      |

---

### Task 1: `impact.ts` math library

**Files:**

- Create: `src/lib/impact.ts`
- Create: `src/__tests__/impact.test.ts`

**Interfaces:**

- Produces:
    - `ImpactScenario = 'low' | 'central' | 'high'`
    - `ImpactRegion = 'global' | 'us' | 'eu' | 'china' | 'india' | 'au' | 'low_water'`
    - `ImpactMetric = 'energy' | 'water' | 'co2'`
    - `estimateImpact(tokens, scenario, region) -> { energy_kwh, water_l, co2_kg }`
    - `householdBaseline(region, window, metric) -> number` (same units as metric)
    - `householdPercent(impact, household) -> number`
    - `formatImpact(metric, n)`, `formatHouseholdPercent(pct, window)`
    - `parseImpactMetric|Scenario|Region`, labels maps

- [x] **Step 1: Write failing tests** for central global 1e6 tokens hand-calc; low < central < high; AU ≠ global; household 7d scaling; all→30d
- [x] **Step 2: Implement `impact.ts` per design spec constants**
- [x] **Step 3: Tests pass**

```bash
npx vitest run src/__tests__/impact.test.ts
```

---

### Task 2: Footprint page + chart + route + footer

**Files:**

- Create: `src/pages/footprint-chart.tsx`, `src/pages/footprint.tsx`
- Modify: `src/index.tsx`, `src/pages/layout.tsx`
- Create: `src/__tests__/footprint-page.test.ts`

- [x] **Step 1: Implement chart/page mirroring Home filters + impact controls + References list**
- [x] **Step 2: Wire `GET /footprint` (browser HTML; markdown optional skip)**
- [x] **Step 3: Footer Product → Footprint**
- [x] **Step 4: Smoke test** `/footprint` contains References + energy controls; footer has `/footprint`

```bash
npx vitest run src/__tests__/impact.test.ts src/__tests__/footprint-page.test.ts
```

---

### Task 3: Spec status + verify

- [x] Mark design spec Status: approved / implemented
- [x] Re-validate reference URLs once
- [x] Full relevant test pass
