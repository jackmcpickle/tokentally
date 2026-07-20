# Footprint Leaderboard (Energy · Water · CO₂e) — Design

Date: 2026-07-20  
Status: approved — implemented  
Stack: Hono on Cloudflare Workers; SSR JSX pages; D1 + KV via `cachedLeaderboard`

## Goal

Add a **Footprint** page (`/footprint`) that shows the same style of SVG bar leaderboard as Home, but ranks people by estimated **energy**, **water**, and **CO₂e** derived from their token totals. Link it from the footer. Estimates follow [TokenWater](https://tokenwater.org/methodology) and [Tokenomy Energy](https://tokenomy.ai/tools?tab=energy), with Low / Central / High scenarios and a region selector (including AU). Each row shows **% of a family-of-4 household** for the selected window and region. Page bottom has a **References** section of validated external links.

## Decisions

| Topic                     | Choice                                                                         |
| ------------------------- | ------------------------------------------------------------------------------ |
| Approach                  | Parallel page + `src/lib/impact.ts` math layer (Home untouched)                |
| Route / title             | `/footprint` · “Footprint”                                                     |
| Footer                    | Product column link → Footprint                                                |
| Ranking metrics           | Energy (kWh) · Water (L) · CO₂e (kg)                                           |
| Scenario                  | Low / Central / High (default Central); varies PUE, WUE_site, J/token together |
| Region                    | Global (default), US, EU, China, India, AU, Low-water DC                       |
| Token basis               | `grand_total` tokens per leaderboard entry                                     |
| J/token band              | TokenWater **Unknown (Wide Range)** — 0.3 / 2 / 10 J/token                     |
| Household UI              | Extra value on each row: `% of household` (not a reference bar)                |
| Household model           | 2 adults + 2 children; region-specific annual baselines scaled to window       |
| `all` window vs household | Compare against **30d household**; label “vs 30d household”                    |
| Filters                   | Same Source + Model + Window as Home                                           |
| Caching                   | Reuse `cachedLeaderboard`; convert/sort in request handler (no new KV shape)   |
| Agent markdown            | Skip for v1 (no `footprint.md.ts` unless other new pages require parity)       |

## Page shape

1. **Hero** — “Footprint” + short estimate disclaimer; active metric · window · scenario · region
2. **Filters** — Source + Model (GET `/footprint`); hidden fields for window/metric/scenario/region
3. **Chart** — same SVG bar pattern as `LeaderboardChart`
4. **Methodology blurb** — estimate-not-meter; link to TokenWater + Tokenomy
5. **Disclaimer** — Low/High = real-world variability, not measurement error
6. **References** — validated outbound links (see below)

### Chart controls

| Control  | Options                                              | Default |
| -------- | ---------------------------------------------------- | ------- |
| Window   | Today / 7d / 30d / All                               | `7d`    |
| Metric   | Energy · Water · CO₂e                                | Energy  |
| Scenario | Low · Central · High                                 | Central |
| Region   | Global · US · EU · China · India · AU · Low-water DC | Global  |

Query params: `window`, `metric` (`energy` \| `water` \| `co2`), `scenario` (`low` \| `central` \| `high`), `region`, `source`, `model`.

### Row display

Primary: formatted impact value for active metric.  
Secondary (muted): `N% of household` (or `vs 30d household` when window is `all`). Cap display at `>999%`. Tooltip: “Avg household: 2 adults + 2 children · {region}”.

## Conversion math (`src/lib/impact.ts`)

```
E_IT  (kWh) = tokens × e_J_per_token / 3_600_000
E_fac (kWh) = PUE × E_IT
W_site (L)  = WUE_site × E_IT
W_grid (L)  = w_grid_cons × E_fac
W_total (L) = W_site + W_grid
CO₂e  (kg)  = E_fac × (gCO₂e_per_kWh) / 1000
```

### Scenario constants (TokenWater)

| Parameter            | Low  | Central | High |
| -------------------- | ---- | ------- | ---- |
| PUE                  | 1.1  | 1.2     | 1.6  |
| WUE_site (L/kWh IT)  | 0.01 | 0.4     | 1    |
| e (J/token, Unknown) | 0.3  | 2       | 10   |

### Region factors

| Region       | w_grid (L/kWh) | gCO₂e/kWh | Notes                                                                  |
| ------------ | -------------- | --------- | ---------------------------------------------------------------------- |
| Global       | 4.81           | 475       | TokenWater global water; mid carbon proxy                              |
| US           | 5.19           | 394       | TokenWater CAMX water; EPA delivered-electricity convention (Tokenomy) |
| EU           | 3.22           | 300       | TokenWater EU proxy water; EEA-order carbon                            |
| China        | 6.02           | 550       | TokenWater                                                             |
| India        | 3.45           | 650       | TokenWater                                                             |
| AU           | 4.26           | 634       | Li et al. offsite EWIF; CER NEM FY24–25 ~0.634 t/MWh                   |
| Low-water DC | 0.2            | 200       | TokenWater optimistic water; low-carbon proxy                          |

### Household baselines (family of 4)

Annual electricity (kWh/yr) and water (L/yr) per region. Scale to window:

- `today` → ÷ 365
- `7d` → × 7/365
- `30d` → × 30/365
- `all` → use 30d household denominator

**CO₂ household** for a region = household electricity (window) × region gCO₂e/kWh / 1000.

Pinned constants (order-of-magnitude; cite in References; adjust in one table):

| Region       | Electricity kWh/yr | Water L/yr     | Basis                                                                                                                                           |
| ------------ | ------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Global       | 3,500              | 150,000        | Midpoint-style proxy between EU and emerging-market bands (not a single official series)                                                        |
| US           | 10,500             | 370,000        | EIA home electricity (~10–12 MWh/home); EPA WaterSense-order ~300 gal/day household → ~410k L/yr, rounded to ~370k for indoor+outdoor awareness |
| EU           | 3,500              | 180,000        | Eurostat household water ~45 m³/person × 4; residential electricity near EU average                                                             |
| China        | 2,500              | 140,000        | Order-of-magnitude between Global and India (explicitly approximate; labeled as estimate)                                                       |
| India        | 1,200              | 120,000        | Order-of-magnitude below China (explicitly approximate; labeled as estimate)                                                                    |
| AU           | 5,700              | 174,000        | ABS Energy Account context; ABS Water Account **174 kL/household** (2023–24)                                                                    |
| Low-water DC | same as Global     | same as Global | No separate household geography                                                                                                                 |

Note: official “average household” stats are not always exactly 2 adults + 2 children. UI copy frames the comparison as a **family of four** using regional household/residential averages. China/India household rows are approximate fillers so the region control stays usable — methodology blurb must say so.

### Ranking

1. Fetch leaderboard entries (same as Home, limit 100).
2. For each entry, `estimateImpact(grand_total, scenario, region)`.
3. Sort by selected metric descending; reassign ranks.
4. Bar width = value / max(value).

### Formatting

- Energy: kWh, or Wh if &lt; 1 kWh
- Water: L, or mL if &lt; 1 L
- CO₂e: kg, or g if &lt; 1 kg
- Household %: integer if ≥ 10%, one decimal if &lt; 10%

## Files

| Path                            | Change                                                                      |
| ------------------------------- | --------------------------------------------------------------------------- |
| `src/lib/impact.ts`             | **New** — types, constants, `estimateImpact`, household helpers, formatters |
| `src/pages/footprint.tsx`       | **New** — page composition                                                  |
| `src/pages/footprint-chart.tsx` | **New** — chart + window/metric/scenario/region controls                    |
| `src/index.tsx`                 | `GET /footprint` + query parsing                                            |
| `src/pages/layout.tsx`          | Footer Product → Footprint                                                  |
| `src/__tests__/impact.test.ts`  | **New** — math + household scaling                                          |

Home (`/`, `leaderboard-chart.tsx`) unchanged.

## Route handler sketch

```
GET /footprint?window&metric&scenario&region&source&model
  → parse (defaults: 7d, energy, central, global)
  → cachedLeaderboard(...)
  → map + sort by impact metric
  → <Footprint entries=… />
```

## References section (validated 2026-07-20)

Bottom of page: heading **References**, then a vertical list of links (title + one-line “used for”). Only include URLs that return HTTP 200 when checked. Drop or replace dead links before ship.

| Link                                                                                                                                                                                 | HTTP | Used for                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ----------------------------------------------------------- |
| [TokenWater methodology](https://tokenwater.org/methodology)                                                                                                                         | 200  | Equations, PUE/WUE, J/token, grid water regions             |
| [Tokenomy Energy Estimator](https://tokenomy.ai/tools?tab=energy)                                                                                                                    | 200  | Energy/CO₂ product framing; US 394 g/kWh convention         |
| [Li et al. 2023 — Making AI Less ‘Thirsty’](https://arxiv.org/abs/2304.03271)                                                                                                        | 200  | Water methodology; AU offsite EWIF ~4.26 L/kWh              |
| [Ren 2024 — Uneven Distribution of AI’s Environmental Impacts](https://arxiv.org/abs/2407.14713)                                                                                     | 200  | Regional grid water variation                               |
| [Macknick et al. 2012 — Operational water factors](https://iopscience.iop.org/article/10.1088/1748-9326/7/4/045802)                                                                  | 200  | Grid water intensity factors                                |
| [EPA eGRID summary data](https://www.epa.gov/egrid/summary-data)                                                                                                                     | 200  | US grid carbon rates                                        |
| [EPA GHG Equivalencies — calculations](https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references)                                               | 200  | Delivered electricity CO₂ (~394 g/kWh); US home kWh context |
| [EPA WaterSense statistics](https://www.epa.gov/watersense/statistics-and-facts)                                                                                                     | 200  | US household water order-of-magnitude                       |
| [EEA — GHG emission intensity of electricity](https://www.eea.europa.eu/en/analysis/indicators/greenhouse-gas-emission-intensity-of-1)                                               | 200  | EU grid carbon context                                      |
| [Eurostat — Water statistics](https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Water_statistics)                                                                   | 200  | EU household water (~40–50 m³/person)                       |
| [CER — Electricity sector emissions 2024–25](https://cer.gov.au/markets/reports-and-data/nger-reporting-data-and-registers/electricity-sector-emissions-and-generation-data-2024-25) | 200  | AU grid intensity                                           |
| [ABS — Water Account Australia](https://www.abs.gov.au/statistics/environment/environmental-accounts/water-account-australia/latest-release)                                         | 200  | AU household water (174 kL/yr)                              |
| [ABS — Energy Account Australia](https://www.abs.gov.au/statistics/industry/energy/energy-account-australia/latest-release)                                                          | 200  | AU household energy context                                 |

**Excluded after validation (do not link):**

- IEA residential electricity chart — HTTP 403 from fetch client
- EIA electricity-use-in-homes — intermittent HTTP 403 (US home kWh covered via EPA Equivalencies)
- ScienceDirect de Vries Joule article — HTTP 400
- CACM “Making AI Less Thirsty” HTML — HTTP 403 (prefer arXiv Li et al.)

Implementation must re-check these links once before merge; remove any that fail.

## Testing

| Case                                | Expect                                        |
| ----------------------------------- | --------------------------------------------- |
| Central Global known tokens         | Deterministic kWh / L / kg matching hand calc |
| Scenario Low &lt; Central &lt; High | Strict ordering for same tokens               |
| Region AU water/CO₂ ≠ Global        | Different W_grid and CO₂e                     |
| Household % for 7d                  | `impact / (annual × 7/365)`                   |
| Window `all` household              | Uses 30d denominator; label differs           |
| `/footprint` HTML                   | Chart + References links present              |
| Footer                              | Footprint link href `/footprint`              |
| Invalid query params                | Fall back to defaults                         |

## Out of scope

- Changing Home token/cost ranking
- Model-specific J/token tiers (frontier vs medium)
- Per-user region preference / geo-IP
- Lifecycle / embodied carbon
- Cost-of-energy estimates
- New DB columns or ingest changes

## Implementation sketch

1. `impact.ts` + unit tests (RED → GREEN)
2. `footprint-chart.tsx` + `footprint.tsx`
3. Route + query parsers in `index.tsx` / small `routes/footprint.ts` if needed
4. Footer link
5. References list (validated URLs only)
6. Smoke/route test for `/footprint`
