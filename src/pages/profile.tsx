import type { FC } from 'hono/jsx';
import { formatDate, formatTokens, formatUsd } from '@/lib/format';
import type { Profile } from '@/lib/aggregate';
import { Layout } from '@/pages/layout';

const SOURCE_LABELS: Record<string, string> = {
    claude_code: 'Claude Code',
    codex: 'Codex',
};

export const ProfilePage: FC<{ base: string; profile: Profile }> = ({ base, profile: p }) => (
    <Layout title={`${p.username} · TokenTally`} base={base}>
        <h1>{p.username}</h1>
        <p class="sub">
            <span class="pill">Rank #{p.rank}</span> &nbsp; joined {formatDate(p.created_at)} ·{' '}
            {p.sessions} sessions tracked
        </p>

        <div class="stat-grid">
            <div class="stat">
                <div class="k">Total tokens</div>
                <div class="v">{formatTokens(p.grand_total)}</div>
            </div>
            <div class="stat">
                <div class="k">Input + output</div>
                <div class="v">{formatTokens(p.input_tokens + p.output_tokens)}</div>
            </div>
            <div class="stat">
                <div class="k">Output</div>
                <div class="v">{formatTokens(p.output_tokens)}</div>
            </div>
            <div class="stat">
                <div class="k">Cache read</div>
                <div class="v">{formatTokens(p.cache_read_tokens)}</div>
            </div>
            <div class="stat">
                <div class="k">Cache write</div>
                <div class="v">{formatTokens(p.cache_creation_tokens)}</div>
            </div>
            <div class="stat">
                <div class="k">Est. cost</div>
                <div class="v">{formatUsd(p.cost)}</div>
            </div>
        </div>

        <h2>By model</h2>
        <div class="panel">
            {p.breakdown.length === 0 ? (
                <div class="empty">No usage reported yet.</div>
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th>Source</th>
                            <th>Model</th>
                            <th class="num">Total</th>
                            <th class="num">Output</th>
                            <th class="num">Est. cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        {p.breakdown.map((b) => (
                            <tr>
                                <td>
                                    <span class="pill">{SOURCE_LABELS[b.source] ?? b.source}</span>
                                </td>
                                <td>
                                    <code>{b.model}</code>
                                </td>
                                <td class="num">
                                    {formatTokens(
                                        b.input_tokens +
                                            b.output_tokens +
                                            b.cache_read_tokens +
                                            b.cache_creation_tokens +
                                            b.reasoning_tokens,
                                    )}
                                </td>
                                <td class="num">{formatTokens(b.output_tokens)}</td>
                                <td class="num">{formatUsd(b.cost)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>

        <p class="sub" style="margin-top:24px">
            <a href="/">← Back to leaderboard</a>
        </p>
    </Layout>
);
