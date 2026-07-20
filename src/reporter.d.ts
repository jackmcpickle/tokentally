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
    export interface CodexPendingUsage {
        model: string;
        last: Record<string, unknown>;
    }
    export interface ParsedCodexRollout extends ParsedTranscript {
        parent_id: string | null;
        pending_inherited: CodexPendingUsage[];
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
    ): ParsedCodexRollout;
    export function resolveCodexInherited(
        parsed: ParsedCodexRollout,
        parent?: string | string[] | null,
    ): ParsedCodexRollout;
    export function codexParentSequenceById(
        parentId: string | null | undefined,
        childPath?: string | null,
    ): string[] | null;
    export function parseOpencodeMessages(
        messages: unknown[],
        opts?: { sessionId?: string; fallbackStartedAt?: number },
    ): ParsedTranscript;
    export function parsePiRollout(
        text: string,
        opts?: { sessionId?: string; fallbackStartedAt?: number },
    ): ParsedTranscript;
    export function parseCursorEvents(events: unknown[]): ReporterRow[];
    export function parseSetProfileUrlArgs(
        argv: string[],
    ): { clear: true } | { clear: false; url: string };
    export function buildProfileUrlBody(parsed: { clear: true }): { url: null };
    export function buildProfileUrlBody(parsed: {
        clear: false;
        url: string;
    }): { url: string };
    export function buildProfileUrlDryRun(args: {
        endpoint: string;
        body: { url: string | null };
    }): {
        method: 'POST';
        url: string;
        headers: {
            'Content-Type': 'application/json';
            Authorization: 'Bearer <redacted>';
        };
        body: { url: string | null };
    };
    export function sessionIdFromPath(path: string): string;
    export function toRows(
        parsed: ParsedTranscript,
        path?: string,
    ): ReporterRow[];
    export function loadConfig(): {
        apiBase: string;
        token: string;
        cursorCookie?: string;
    };

    const content: string;
    export default content;
}

// Vite/vitest raw-source import, used by the privacy tests.
declare module '*/tokentally.mjs?raw' {
    const source: string;
    export default source;
}
