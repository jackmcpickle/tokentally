// The reporter is imported two ways:
//  - the worker imports the DEFAULT (raw text, via the wrangler "Text" rule) and
//    serves it from GET /tokentally.mjs;
//  - tests import its NAMED pure parsers from the real .mjs at runtime.
// Both shapes are declared here for type-checking only.
declare module '*/tokentally.mjs' {
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
    export function parseClaudeTranscript(
        text: string,
        opts?: { sessionId?: string; fallbackStartedAt?: number },
    ): ParsedTranscript;
    export function parseCodexRollout(
        text: string,
        opts?: { sessionId?: string; fallbackStartedAt?: number },
    ): ParsedTranscript;
    export function parseOpencodeMessages(
        messages: unknown[],
        opts?: { sessionId?: string; fallbackStartedAt?: number },
    ): ParsedTranscript;
    export function parsePiRollout(
        text: string,
        opts?: { sessionId?: string; fallbackStartedAt?: number },
    ): ParsedTranscript;
    export function sessionIdFromPath(path: string): string;
    export function toRows(
        parsed: ParsedTranscript,
        path?: string,
    ): ReporterRow[];

    const content: string;
    export default content;
}
