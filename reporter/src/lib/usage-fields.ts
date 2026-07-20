/** Canonical field alias maps for each agent’s native usage shape. */

export const CLAUDE_USAGE_FIELDS = {
    input: 'input_tokens',
    output: 'output_tokens',
    cache_read: 'cache_read_input_tokens',
    cache_creation: 'cache_creation_input_tokens',
} as const;

export const CODEX_USAGE_FIELDS = {
    input: 'input_tokens',
    output: 'output_tokens',
    cache_read: 'cached_input_tokens',
    cache_creation: 'cache_write_input_tokens',
    reasoning: 'reasoning_output_tokens',
} as const;

export const OPENCODE_USAGE_FIELDS = {
    input: 'input',
    output: 'output',
    cache_read: 'cache_read',
    cache_creation: 'cache_write',
    reasoning: 'reasoning',
} as const;

export const PI_USAGE_FIELDS = {
    input: ['input', 'input_tokens'],
    output: ['output', 'output_tokens'],
    cache_read: ['cacheRead', 'cache_read', 'cache_read_input_tokens'],
    cache_creation: [
        'cacheWrite',
        'cache_write',
        'cache_creation_input_tokens',
    ],
    reasoning: ['reasoning', 'reasoning_tokens', 'reasoning_output_tokens'],
} as const;

export const CURSOR_USAGE_FIELDS = {
    input: 'inputTokens',
    output: 'outputTokens',
    cache_read: 'cacheReadTokens',
    cache_creation: 'cacheWriteTokens',
} as const;
