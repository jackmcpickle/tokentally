import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    claudeEmbeddedSessionId,
    claudeSessionIdFromPath,
    claudeSessionSiblings,
} from '../../reporter/src/agents/claude-sessions';

function claudeEvent(opts: {
    sid?: string;
    messageId?: string;
    input?: number;
    output?: number;
    ts?: string;
}): string {
    const event: Record<string, unknown> = {
        type: 'assistant',
        timestamp: opts.ts ?? '2026-07-18T10:00:05Z',
        message: {
            ...(opts.messageId ? { id: opts.messageId } : {}),
            model: 'claude-opus-4-8',
            usage: {
                input_tokens: opts.input ?? 100,
                output_tokens: opts.output ?? 10,
            },
        },
    };
    if (opts.sid) event.sessionId = opts.sid;
    return JSON.stringify(event);
}

describe('claudeSessionIdFromPath', () => {
    it('derives the session id from either layout', () => {
        expect(claudeSessionIdFromPath('/p/sess-x.jsonl')).toBe('sess-x');
        expect(
            claudeSessionIdFromPath('/p/sess-x/subagents/agent-a.jsonl'),
        ).toBe('sess-x');
    });

    it('derives the session id from nested workflow subagent paths', () => {
        expect(
            claudeSessionIdFromPath(
                '/p/sess-x/subagents/workflows/wf-1/agent-a.jsonl',
            ),
        ).toBe('sess-x');
    });

    it('treats the .jsonl extension case-insensitively', () => {
        expect(claudeSessionIdFromPath('/p/sess-x.JSONL')).toBe('sess-x');
        expect(
            claudeSessionIdFromPath('/p/sess-x/SUBAGENTS/agent-a.jsonl'),
        ).toBe('sess-x');
    });

    it('strips the rollout- prefix like the toRows fallback', () => {
        // Keeps upgrade continuity: pre-aggregation uploads used
        // sessionIdFromPath, so an id-less rollout-*.jsonl must not move to
        // a new session key.
        expect(claudeSessionIdFromPath('/p/rollout-abc.jsonl')).toBe('abc');
        expect(claudeSessionIdFromPath('/p/.jsonl')).toBe('.jsonl');
    });

    it('never treats the stop directory itself as a session dir', () => {
        // A stray subagents/ folder directly under the claude projects root
        // must not make the ROOT the session directory.
        expect(
            claudeSessionIdFromPath(
                '/h/.claude/projects/subagents/agent-a.jsonl',
                '/h/.claude/projects',
            ),
        ).toBe('agent-a');
    });

    it('ignores subagents components above the stop directory', () => {
        // A 'subagents' component in the path PREFIX (e.g. a home directory)
        // must not hijack session-id derivation for files below stopDir.
        expect(
            claudeSessionIdFromPath(
                '/users/subagents/.claude/projects/p/sess-a.jsonl',
                '/users/subagents/.claude/projects',
            ),
        ).toBe('sess-a');
        expect(
            claudeSessionIdFromPath(
                '/users/subagents/.claude/projects/p/sess-a/subagents/agent-1.jsonl',
                '/users/subagents/.claude/projects',
            ),
        ).toBe('sess-a');
    });
});

describe('claude session file discovery', () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'tokenmaxer-claude-'));
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    function writeSession(): {
        root: string;
        agentA: string;
        agentB: string;
    } {
        const root = join(dir, 'sess-p.jsonl');
        const agents = join(dir, 'sess-p', 'subagents');
        mkdirSync(agents, { recursive: true });
        const agentA = join(agents, 'agent-a.jsonl');
        const agentB = join(agents, 'agent-b.jsonl');
        writeFileSync(root, claudeEvent({ sid: 'sess-p', input: 100 }));
        writeFileSync(agentA, claudeEvent({ sid: 'sess-p', input: 200 }));
        writeFileSync(agentB, claudeEvent({ sid: 'sess-p', input: 300 }));
        return { root, agentA, agentB };
    }

    it('finds all sibling files from the root transcript', () => {
        const { root, agentA, agentB } = writeSession();
        expect(claudeSessionSiblings(root).sort()).toEqual(
            [root, agentA, agentB].sort(),
        );
    });

    it('finds all sibling files from a subagent transcript', () => {
        const { root, agentA, agentB } = writeSession();
        expect(claudeSessionSiblings(agentA).sort()).toEqual(
            [root, agentA, agentB].sort(),
        );
    });

    it('finds nested workflow subagent files as siblings', () => {
        const { root, agentA, agentB } = writeSession();
        const wfDir = join(dir, 'sess-p', 'subagents', 'workflows', 'wf-1');
        mkdirSync(wfDir, { recursive: true });
        const wfAgent = join(wfDir, 'agent-w.jsonl');
        writeFileSync(wfAgent, claudeEvent({ sid: 'sess-p', input: 50 }));
        expect(claudeSessionSiblings(root).sort()).toEqual(
            [root, agentA, agentB, wfAgent].sort(),
        );
        expect(claudeSessionSiblings(wfAgent).sort()).toEqual(
            [root, agentA, agentB, wfAgent].sort(),
        );
    });

    it('finds a case-variant root transcript from a subagent path', () => {
        const root = join(dir, 'sess-up.JSONL');
        const agents = join(dir, 'sess-up', 'subagents');
        mkdirSync(agents, { recursive: true });
        const agent = join(agents, 'agent-a.jsonl');
        writeFileSync(root, claudeEvent({ sid: 'sess-up', input: 100 }));
        writeFileSync(agent, claudeEvent({ sid: 'sess-up', input: 20 }));
        expect(claudeSessionSiblings(agent).sort()).toEqual(
            [root, agent].sort(),
        );
        // From the root itself, the hooked path is used as-is.
        expect(claudeSessionSiblings(root).sort()).toEqual(
            [root, agent].sort(),
        );
    });

    it('returns the path itself when the session has one lone file', () => {
        const lone = join(dir, 'sess-lone.jsonl');
        writeFileSync(lone, claudeEvent({ sid: 'sess-lone' }));
        expect(claudeSessionSiblings(lone)).toEqual([lone]);
    });

    it.skipIf(userInfo().uid === 0)(
        'recovers canonical names when the parent directory is unlistable',
        () => {
            const { root, agentA, agentB } = writeSession();
            // Traversable but not listable: entries remain accessible by
            // exact name, readdir fails.
            chmodSync(dir, 0o311);
            try {
                expect(claudeSessionSiblings(agentA).sort()).toEqual(
                    [root, agentA, agentB].sort(),
                );
                expect(claudeSessionSiblings(root).sort()).toEqual(
                    [root, agentA, agentB].sort(),
                );
            } finally {
                chmodSync(dir, 0o755);
            }
        },
    );

    it.skipIf(userInfo().uid === 0)(
        'reports an unlistable subagents dir through failedDirs',
        () => {
            const { root } = writeSession();
            const agents = join(dir, 'sess-p', 'subagents');
            chmodSync(agents, 0o000);
            try {
                const failedDirs: string[] = [];
                claudeSessionSiblings(root, failedDirs);
                expect(failedDirs).toContain(agents);
            } finally {
                chmodSync(agents, 0o755);
            }
        },
    );

    it('does not report an absent session dir as a failure', () => {
        const lone = join(dir, 'sess-lone.jsonl');
        writeFileSync(lone, claudeEvent({ sid: 'sess-lone' }));
        const failedDirs: string[] = [];
        claudeSessionSiblings(lone, failedDirs);
        expect(failedDirs).toEqual([]);
    });

    it('peeks the first embedded session id from a file head', () => {
        const path = join(dir, 'whatever.jsonl');
        writeFileSync(
            path,
            ['{"type":"progress"}', claudeEvent({ sid: 'sess-peek' })].join(
                '\n',
            ),
        );
        expect(claudeEmbeddedSessionId(path)).toBe('sess-peek');
        expect(claudeEmbeddedSessionId(join(dir, 'missing.jsonl'))).toBe(null);
    });
});
