import type { FC } from 'hono/jsx';
import { Button } from '@/pages/components/button';
import { VARIANT_NAMES } from '@/pages/prototype/chart-variants';

const VARIANTS = ['A', 'B', 'C'] as const;

/**
 * PROTOTYPE floating switcher — not part of product UI.
 * Cycles ?variant= and preserves period/chartMetric.
 */
export const PrototypeSwitcher: FC<{ current: string }> = ({ current }) => {
    const label = VARIANT_NAMES[current] ?? 'Unknown';
    const idx = VARIANTS.indexOf(current as (typeof VARIANTS)[number]);
    const safeIdx = idx >= 0 ? idx : 0;
    const prev = VARIANTS[(safeIdx - 1 + VARIANTS.length) % VARIANTS.length]!;
    const next = VARIANTS[(safeIdx + 1) % VARIANTS.length]!;

    return (
        <>
            <div
                id="prototype-switcher"
                class="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-panel px-2 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.55)]"
            >
                <Button
                    variant="secondary"
                    type="button"
                    data-proto-nav={prev}
                    class="!min-h-0 px-3 py-1.5 text-sm font-bold"
                    aria-label="Previous variant"
                >
                    ←
                </Button>
                <div class="min-w-[140px] px-2 text-center text-sm font-bold tabular-nums">
                    {current} — {label}
                </div>
                <Button
                    variant="secondary"
                    type="button"
                    data-proto-nav={next}
                    class="!min-h-0 px-3 py-1.5 text-sm font-bold"
                    aria-label="Next variant"
                >
                    →
                </Button>
            </div>
            <script
                dangerouslySetInnerHTML={{
                    __html: `
(function () {
  function go(v) {
    var u = new URL(location.href);
    u.searchParams.set('variant', v);
    location.href = u.toString();
  }
  document.querySelectorAll('[data-proto-nav]').forEach(function (el) {
    el.addEventListener('click', function () { go(el.getAttribute('data-proto-nav')); });
  });
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (!t) return;
    var tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable) return;
    var order = ${JSON.stringify([...VARIANTS])};
    var cur = new URL(location.href).searchParams.get('variant') || 'A';
    var i = order.indexOf(cur);
    if (i < 0) i = 0;
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(order[(i - 1 + order.length) % order.length]); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(order[(i + 1) % order.length]); }
  });
})();
`,
                }}
            />
        </>
    );
};
