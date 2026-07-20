export interface ReporterTotals {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    reasoning_tokens: number;
}

export interface ParsedTranscript {
    session_id: string | null;
    started_at: number | null;
    models: Map<string, ReporterTotals>;
}

export interface ReporterRow extends ReporterTotals {
    session_id: string;
    model: string;
    started_at: number;
}

export interface ReporterConfig {
    apiBase: string;
    token: string;
    cursorCookie?: string;
}

export interface ParseOpts {
    sessionId?: string;
    fallbackStartedAt?: number | null;
}

export interface PostOpts {
    path?: string;
    chunkSize?: number;
}

export type JsonObject = Record<string, unknown>;

export type TotalsKey = keyof ReporterTotals;
