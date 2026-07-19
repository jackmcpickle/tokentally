# Profile Share Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dynamic per-user OG PNG at `/u/:username/og.png` plus on-profile share UI (copy / download / Web Share).

**Architecture:** SVG Poster-flex template → `@cf-wasm/resvg` PNG on the Worker; data via `cachedProfile` + cached 7d totals; HTTP Cache API middleware (`tokentally-og`, 600s) matching existing page cache.

**Tech Stack:** Hono, D1, KV, Cache API, `@cf-wasm/resvg`, vitest

## Global Constraints

- Reuse `READ_CACHE_TTL_SECONDS` (600); no shorter OG-only TTL
- Invalidate 7d + all-time profile KV keys together on ingest
- Card stats: Last 7 days + All time (tokens, est. cost, sessions); username; rank; brand
- Format with `formatTokens` / `formatUsd`

## File map

| File                          | Role                                        |
| ----------------------------- | ------------------------------------------- |
| `src/lib/aggregate.ts`        | `getProfileWindowTotals`                    |
| `src/lib/cached-aggregate.ts` | `cachedProfileWindow` / 7d key + invalidate |
| `src/lib/page-cache.ts`       | `ogCache` middleware                        |
| `src/lib/share-card.ts`       | Card payload + SVG builder                  |
| `src/lib/share-card-png.ts`   | resvg rasterize                             |
| `src/routes/og.ts`            | `GET /u/:username/og.png`                   |
| `src/index.tsx`               | Mount OG route before profile HTML          |
| `src/pages/layout.tsx`        | Optional og meta overrides                  |
| `src/pages/profile.tsx`       | Share panel + script                        |
| `src/__tests__/*`             | Unit + route tests                          |

---

## Task 1: Window totals + cache

- [ ] Add `getProfileWindowTotals` + tests
- [ ] Add `profileWindowCacheKey`, `cachedProfileWindow`, extend `invalidateProfileCache`
- [ ] Update cached-aggregate tests

## Task 2: SVG + PNG route

- [ ] `buildShareCardSvg` + escape tests
- [ ] Install `@cf-wasm/resvg`, `renderShareCardPng`
- [ ] `ogCache` + route; wire in `index.tsx`
- [ ] Route tests (200 PNG / 404 / Cache-Control)

## Task 3: Profile UI + meta

- [ ] Layout `ogImage` / `ogUrl` / `description`
- [ ] Profile share panel + progressive script
- [ ] Assert `og:image` in profile HTML test
