import type { Profile, ProfileWindowTotals } from '@/lib/aggregate';
import { formatTokens, formatUsd } from '@/lib/format';

export interface ShareCardStats {
    tokens: string;
    cost: string;
    sessions: string;
}

export interface ShareCardPayload {
    username: string;
    rank: string;
    last7d: ShareCardStats;
    allTime: ShareCardStats;
}

const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';

export function escapeXml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function toStats(totals: ProfileWindowTotals): ShareCardStats {
    return {
        tokens: formatTokens(totals.grand_total),
        cost: formatUsd(totals.cost),
        sessions: String(Math.round(totals.sessions)),
    };
}

function escapeStats(stats: ShareCardStats): ShareCardStats {
    return {
        tokens: escapeXml(stats.tokens),
        cost: escapeXml(stats.cost),
        sessions: escapeXml(stats.sessions),
    };
}

export function buildShareCardPayload(
    profile: Profile,
    last7d: ProfileWindowTotals,
): ShareCardPayload {
    return {
        username: profile.username,
        rank: String(profile.rank),
        last7d: toStats(last7d),
        allTime: toStats({
            grand_total: profile.grand_total,
            cost: profile.cost,
            sessions: profile.sessions,
        }),
    };
}

function metricColumns(stats: ShareCardStats, startX: number): string {
    const cols = [
        { label: 'Tokens', value: stats.tokens, x: startX },
        { label: 'Est. cost', value: stats.cost, x: startX + 188 },
        { label: 'Sessions', value: stats.sessions, x: startX + 376 },
    ];
    return cols
        .map(
            ({ label, value, x }) => `
  <text x="${x}" y="380" font-family="${FONT}" font-size="18" font-weight="400" fill="#666666">${label}</text>
  <text x="${x}" y="420" font-family="${FONT}" font-size="40" font-weight="600" fill="#FFFFFF" letter-spacing="-1.5">${value}</text>`,
        )
        .join('');
}

/** Poster-flex 1200×630 SVG for social previews. */
export function buildShareCardSvg(payload: ShareCardPayload): string {
    const username = escapeXml(payload.username);
    const rank = escapeXml(payload.rank);
    const last7d = escapeStats(payload.last7d);
    const allTime = escapeStats(payload.allTime);

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" fill="none">
  <rect width="1200" height="630" fill="#0A0A0A"/>
  <rect width="1200" height="1" fill="#FFFFFF" opacity="0.06"/>

  <g transform="translate(72, 56)" fill="#FFFFFF">
    <rect x="0" y="24" width="36" height="10" rx="5" opacity="0.4"/>
    <rect x="8" y="12" width="36" height="10" rx="5" opacity="0.7"/>
    <rect x="16" y="0" width="36" height="10" rx="5"/>
  </g>
  <text x="140" y="82" font-family="${FONT}" font-size="28" fill="#FFFFFF" letter-spacing="-1">
    <tspan font-weight="400">token</tspan><tspan font-weight="900">maxer</tspan><tspan font-weight="400" fill="#999999">.quest</tspan>
  </text>

  <rect x="980" y="52" width="148" height="40" rx="20" stroke="#333333" stroke-width="1.5"/>
  <text x="1054" y="78" text-anchor="middle" font-family="${FONT}" font-size="18" font-weight="500" fill="#999999">Rank #${rank}</text>

  <text x="72" y="220" font-family="${FONT}" font-size="96" font-weight="600" fill="#FFFFFF" letter-spacing="-5">${username}</text>

  <line x1="72" y1="280" x2="1128" y2="280" stroke="#222222" stroke-width="1"/>

  <text x="72" y="330" font-family="${FONT}" font-size="16" font-weight="500" fill="#999999" letter-spacing="1.2">LAST 7 DAYS</text>${metricColumns(last7d, 72)}

  <text x="660" y="330" font-family="${FONT}" font-size="16" font-weight="500" fill="#999999" letter-spacing="1.2">ALL TIME</text>${metricColumns(allTime, 660)}
</svg>`;
}
