# Design — tokenmaxer quest UI redesign

Locked visual system: project-root `DESIGN.md` (Framer-inspired black-canvas marketing). Product name: **tokenmaxer quest**.

## Goal

Redo style and layout of the entire public site so every page reads as a dark, poster-grade marketing surface: oversized display type, white/charcoal pills, scarce gradient spotlight cards, accent blue only for links and focus. Approach: **big-bang page markup/layout first, design tokens last**.

## Decisions

| Decision             | Choice                                                                       |
| -------------------- | ---------------------------------------------------------------------------- |
| Depth                | **B** — full Framer-style layout on every page                               |
| Implementation order | **2** — rewrite page markup/layout first; backfill tokens after              |
| Display font         | Mona Sans (open substitute for GT Walsheim Medium)                           |
| Body font            | Inter (Variable preferred) with documented OpenType variants where available |
| Brand name           | tokenmaxer quest (replace TokenTally in UI copy, titles, wordmark)           |
| Color mode           | Dark only — no light mode                                                    |

## Visual system (from DESIGN.md)

### Color

- **Canvas**: near-black page background for hero, body, FAQ-like bands, footer.
- **Surface 1 / 2**: charcoal lifts for cards, tables, secondary pills, featured panels.
- **Ink / ink-muted**: white primary type; gray (#999) secondary. Hierarchy is binary, not mid-tone sprawl.
- **Accent blue**: hyperlinks, focus rings, selection only — never button fills or section backgrounds.
- **Primary / inverse**: white pills and light-on-dark CTAs.
- **Aurora spotlight cards**: shared indigo / electric blue / magenta / coral / peach mesh with film grain and slow 3D drift (no cream/white); four blob compositions (class names violet/magenta/orange/coral kept for markup). Individual cards inside otherwise monochrome grids, not full-section backgrounds. One or two per long page max.

### Typography

- Display: Mona Sans, weight ~500, aggressive negative tracking scaled with size (preserve percentage tracking if size is reduced for mobile).
- Body: Inter, dense ~1.30 line-height, weight 400; caption/button ~500.
- Hierarchy via size + tracking, not 700/900 weight ramps.
- Scale anchors (desktop → scale down on tablet/mobile): display-xxl ~110px → display-lg ~62px → display-md ~32px for smallest viewports.

### Shape & components

- Primary CTA: white pill (`rounded.pill` / ~100px).
- Secondary: charcoal pill.
- Cards: ~15–20px radius; gradient spotlights ~30px.
- Inputs: surface-1 fill, ~10px radius, blue-tinted 1px focus ring.
- No bordered ghost primary buttons; no gold/silver/bronze rank chrome — use ink + muted meta.

### Spacing & grid

- Base unit ~5px (5/10/15/20/30).
- Section vertical breathing ~96px on marketing bands; tighter (~64px) around dense tables.
- Max content width ~1199–1200px; card grids 2-up → 1-up below ~810px.

## Site chrome

### Top nav

- Sticky, canvas background, ~56px height.
- Left: wordmark **tokenmaxer quest**.
- Center: Leaderboard · Get started · About.
- Right: white pill **Get started** (no Sign-in control; product has no session auth UI).
- Below 810px: hamburger for links; primary pill remains on the bar.

### Footer

- Dense caption grid on canvas.
- Product blurb + link columns (Leaderboard, Start, About, How it works).
- Ink-muted links; no bordered card footer.

## Per-page layouts

### Home

1. Poster hero: oversized display line (e.g. “The token leaderboard”) + one lead sentence + white pill to Get started.
2. Filter row as charcoal controls (not a boxed toolbar).
3. Leaderboard table in a surface-1 card.
4. At most one aurora spotlight (claim / empty-state nudge) in the first long scroll.
5. Chart prototypes: keep functional; restyle lightly or leave nested — not a redesign focus.

### Start

1. Poster opener (“Claim your name”) + short setup pitch.
2. Registration form on surface-1 with blue focus rings.
3. Post-claim result: charcoal step panels; one aurora spotlight for the copy-hook-config moment.
4. Primary = white pills; Copy = charcoal pills.

### Profile

1. Display username as hero; rank + joined as ink-muted meta.
2. Stats as 2-up charcoal grid (not tiny bordered metric chips).
3. Model breakdown table in surface-1.
4. Optional single spotlight for board / get-started return.

### About

1. Long-document on canvas: one display opener, then H2 bands with dense Inter body.
2. No card wrapping every section.
3. Honor-system callout may use one aurora spotlight.
4. Footer CTA: white pill to Get started.

## Motion

- Hero display + primary CTA: fade/slide in on load, ~80ms stagger, ease-out expo/quart.
- Primary pill pressed: scale ~0.98.
- Links: accent blue + underline on hover.
- Spotlight cards: opacity/brightness only.
- `prefers-reduced-motion: reduce`: opacity-only transitions ≤150ms.
- No bounce, elastic, or celebratory toasts.

## Implementation order (approach 2)

1. **Markup/layout pass** — rewrite `layout.tsx`, `home.tsx`, `start.tsx`, `profile.tsx`, `about.tsx`, and `ui.ts` class bundles for Framer structure, brand rename, nav/footer, heroes, spotlights, table/stat compositions. Temporary colors may still use interim utilities.
2. **Token pass** — map `DESIGN.md` into `src/styles/tailwind.css` `@theme` (and rebuild `app.css`): canvas, surfaces, ink, accent-blue, radii, type scale, fonts. Align utilities and base styles. Load Mona Sans + Inter in Layout head.
3. **Polish** — motion, focus rings, responsive collapse at 810px, contrast check for ink/ink-muted on canvas.

## Files

### Modify

- `src/pages/layout.tsx`
- `src/pages/home.tsx`
- `src/pages/start.tsx`
- `src/pages/profile.tsx`
- `src/pages/about.tsx`
- `src/pages/ui.ts`
- `src/styles/tailwind.css`
- `src/styles/app.css` (via `pnpm build:css` or project equivalent)
- Any user-facing brand strings in page titles / meta that still say TokenTally

### Create

- None required (fonts via `<link>` / CDN). Optional small shared JSX helpers only if they reduce duplication without a new component architecture.

### Delete

- None.

## Out of scope

- API routes, D1 schema, aggregation logic
- Reporter behavior and `tokentally.mjs` filename (unless separately requested)
- New auth / sign-in product features
- Light mode
- Invented metrics, testimonials, or fake social proof
- Full chart-prototype redesign

## Success criteria

- First viewport on each marketing-facing page reads as one dark poster composition with brand wordmark as a hero-level signal.
- CTAs are white pills; secondary actions charcoal pills; accent blue only on links/focus.
- Gradient atmosphere appears only as scarce spotlight cards.
- All public pages share the same nav/footer/type/color voice under the name **tokenmaxer quest**.
- Responsive: usable at mobile widths; no horizontal scroll; display type scales down while keeping tight tracking ratios.
- Reduced-motion respected.

## Self-review notes

- No TBD placeholders for core decisions.
- Approach 2 and depth B are explicit and do not contradict per-page layouts.
- Scope is four public pages + shared chrome/styles; backend unchanged.
- Brand rename is UI-facing; package/repo paths may still say tokentally until a separate rename task.
