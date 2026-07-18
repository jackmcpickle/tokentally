// Shared Tailwind utility bundles for the repeated component patterns that used
// to be semantic CSS classes (.panel, .stat, .pill, …). Element-level typography
// and form/table defaults live in src/styles/tailwind.css (@layer base).

export const sub = 'mb-6 text-muted';
export const muted = 'text-muted';
export const panel = 'rounded-xl border border-border bg-panel p-[18px]';
export const empty = 'p-6 text-center text-muted';
export const num = 'text-right tabular-nums';

export const filters = 'mb-[18px] flex flex-wrap gap-2.5';
export const filterLabel = 'flex flex-col gap-1 text-xs text-muted';

export const btnPrimary =
    'cursor-pointer rounded-lg border-0 bg-accent px-4 py-2.5 text-sm font-bold text-bg hover:brightness-110';
export const btnGhost =
    'cursor-pointer rounded-lg border border-border bg-panel2 px-4 py-2.5 text-sm font-bold text-text hover:brightness-110';
export const btnCopy =
    'absolute right-2 top-2 cursor-pointer rounded-lg border border-border bg-panel2 px-2.5 py-[5px] text-xs font-bold text-text hover:brightness-110';

export const pill =
    'inline-block rounded-full border border-border bg-panel2 px-2 py-0.5 text-xs text-muted';

export const statGrid =
    'grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3';
export const stat = 'rounded-[10px] border border-border bg-panel2 p-3.5';
export const statK = 'text-xs uppercase tracking-[0.04em] text-muted';
export const statV = 'mt-1 text-2xl font-extrabold tabular-nums';

export const notice =
    'my-4 rounded-[10px] border border-accent/30 bg-accent/[0.08] px-3.5 py-3 text-sm';
export const copyrow = 'relative';
export const field = 'my-3.5 block';
export const fieldLbl = 'mb-1.5 block text-xs text-muted';
