import { grandTotal, type Profile } from '@/lib/aggregate';
import { formatDate, formatTokens, formatUsd } from '@/lib/format';

const SOURCE_LABELS: Record<string, string> = {
    claude_code: 'Claude Code',
    codex: 'Codex',
    opencode: 'opencode',
    pi: 'pi',
    cursor: 'Cursor',
};

function row(cols: string[]): string {
    return `| ${cols.join(' | ')} |`;
}

const SUMMARY_HEADER = row([
    'Total',
    'Input',
    'Output',
    'Cache read',
    'Cache write',
    'Reasoning',
    'Sessions',
    'Est. cost',
]);
const SUMMARY_DIVIDER = row(new Array(8).fill('---'));

const MODEL_HEADER = row([
    'Source',
    'Model',
    'Input',
    'Output',
    'Cache read',
    'Cache write',
    'Reasoning',
    'Total',
    'Est. cost',
]);
const MODEL_DIVIDER = row(new Array(9).fill('---'));

export function profileMarkdown(opts: {
    base: string;
    profile: Profile;
}): string {
    const { base, profile: p } = opts;
    const linkLine = p.url ? `\n\nProfile: [${p.url}](${p.url})` : '';

    const summary = [
        SUMMARY_HEADER,
        SUMMARY_DIVIDER,
        row([
            formatTokens(p.grand_total),
            formatTokens(p.input_tokens),
            formatTokens(p.output_tokens),
            formatTokens(p.cache_read_tokens),
            formatTokens(p.cache_creation_tokens),
            formatTokens(p.reasoning_tokens),
            String(p.sessions),
            formatUsd(p.cost),
        ]),
    ].join('\n');

    const modelTable =
        p.breakdown.length === 0
            ? `${MODEL_HEADER}\n${MODEL_DIVIDER}\n\nNo usage reported yet.`
            : [
                  MODEL_HEADER,
                  MODEL_DIVIDER,
                  ...p.breakdown.map((b) =>
                      row([
                          SOURCE_LABELS[b.source] ?? b.source,
                          b.model,
                          formatTokens(b.input_tokens),
                          formatTokens(b.output_tokens),
                          formatTokens(b.cache_read_tokens),
                          formatTokens(b.cache_creation_tokens),
                          formatTokens(b.reasoning_tokens),
                          formatTokens(grandTotal(b)),
                          formatUsd(b.cost),
                      ]),
                  ),
              ].join('\n');

    return `# ${p.username}

Rank #${p.rank} · joined ${formatDate(p.created_at)} · ${p.sessions} sessions tracked${linkLine}

${summary}

## By model

${modelTable}

Docs: \`${base}/llms.txt\`
Full profile JSON: \`${base}/api/u/${p.username}\`
`;
}

export function profileNotFoundMarkdown(username: string): string {
    return `# Not found

No profile for \`${username}\`. Usernames are case-insensitive — double-check the spelling, or claim it yourself via the start guide.
`;
}
