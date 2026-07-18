export function formatTokens(n: number): string {
    if (n < 1000) return String(n);
    if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
    if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
    return `${(n / 1_000_000_000).toFixed(2)}B`;
}

export function formatInt(n: number): string {
    return Math.round(n).toLocaleString('en-US');
}

export function formatUsd(n: number): string {
    if (n < 1) return `$${n.toFixed(2)}`;
    if (n < 1000) return `$${n.toFixed(2)}`;
    return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function formatDate(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}
