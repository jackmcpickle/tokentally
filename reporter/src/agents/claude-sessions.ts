// Claude Code stores one logical session across several transcript files: a
// root `<sessionId>.jsonl` plus subagent transcripts under
// `<sessionId>/subagents/` (nesting deeper for workflow subagents), every one
// stamped with the SAME sessionId. Parsing each file independently produces
// rows that collide on the API's (user, source, session, model) key, and the
// upsert REPLACES on conflict — whichever file's row lands last erases the
// others. This module merges all of a session's files into one row per
// (session, model), with one cardinal rule: never upload a session's row
// unless every known contribution to it was read.
import type { Dirent } from 'node:fs';
import {
    closeSync,
    openSync,
    readdirSync,
    readFileSync,
    readSync,
    realpathSync,
    statSync,
} from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';
import { jsonlObjects } from '../lib/parse-utils';
import { sessionIdFromPath, toRows } from '../lib/rows';
import type { ReporterRow } from '../lib/types';
import type { ClaudeUsageRow } from './claude';
import { claudeDirs, scanClaudeTranscript, sumClaudeRows } from './claude';

const CLAUDE_SUBAGENT_DIR = 'subagents';
const CLAUDE_JSONL = /\.jsonl$/iu;

interface WalkedFile {
    path: string;
    mtimeMs: number;
    sid: string;
}

type SessionGroups = Map<string, WalkedFile[]>;

// ------------------------------------------------------ path derivation ----

/**
 * The filename with its .jsonl suffix stripped; falls back to the full
 * basename so a bare `.jsonl` filename still yields a non-empty id.
 */
function claudeStem(path: string): string {
    return basename(path).replace(CLAUDE_JSONL, '') || basename(path);
}

/**
 * The claudeDirs() root `path` lives under, if any — used to bound ancestor
 * walks so a `subagents` directory component ABOVE the projects tree (e.g. in
 * a home directory path) can never be mistaken for the session layout.
 */
function claudeStopDirFor(path: string): string | null {
    for (const d of claudeDirs()) {
        if (path.startsWith(`${d}${sep}`)) return d;
    }
    return null;
}

function claudeSessionDirOf(
    path: string,
    stopDir: string | null,
): string | null {
    let sessionDir: string | null = null;
    let cur = dirname(path);
    for (;;) {
        if (stopDir !== null && cur === stopDir) break;
        if (basename(cur).toLowerCase() === CLAUDE_SUBAGENT_DIR) {
            const parent = dirname(cur);
            // The claudeDirs root itself can never be a session directory.
            if (stopDir === null || parent !== stopDir) sessionDir = parent;
        }
        const parent = dirname(cur);
        if (parent === cur) break;
        cur = parent;
    }
    return sessionDir;
}

/**
 * Path-derived Claude session id, aware of the `<sid>/subagents/` layout —
 * subagent files can nest arbitrarily deep (workflow subagents live at
 * `<sid>/subagents/workflows/<wf>/agent-*.jsonl`), so the OUTERMOST
 * `subagents` component below `stopDir` marks the session directory.
 */
export function claudeSessionIdFromPath(
    path: string,
    stopDir?: string | null,
): string {
    const sessionDir = claudeSessionDirOf(
        path,
        stopDir ?? claudeStopDirFor(path),
    );
    if (sessionDir) return basename(sessionDir);
    // Match toRows' fallback (sessionIdFromPath) so ids stay stable for
    // transcripts uploaded by earlier reporter versions.
    return sessionIdFromPath(path) || basename(path);
}

function claudeRealIndex(groups: SessionGroups): Map<string, WalkedFile> {
    const byReal = new Map<string, WalkedFile>();
    for (const group of groups.values())
        for (const f of group) byReal.set(claudeRealKey(f.path), f);
    return byReal;
}

function claudeRealKey(path: string): string {
    try {
        return realpathSync(path);
    } catch {
        return path;
    }
}

// -------------------------------------------------------------- walking ----

// Dirent type check that resolves through symlinks with a single stat:
// Dirent.isDirectory()/isFile() are false for links, but a symlinked session
// directory or transcript is still part of the corpus. (The codex/pi walker
// in lib/fs-walk deliberately keeps its never-follow behaviour.)
function direntStats(e: Dirent, full: string): { dir: boolean; file: boolean } {
    if (e.isDirectory()) return { dir: true, file: false };
    if (e.isFile()) return { dir: false, file: true };
    if (!e.isSymbolicLink()) return { dir: false, file: false };
    try {
        const s = statSync(full);
        return { dir: s.isDirectory(), file: s.isFile() };
    } catch {
        return { dir: false, file: false };
    }
}

interface WalkChannels {
    failedDirs?: string[];
    seenDirs?: Set<string>;
}

// One recursive traversal collecting { path, mtimeMs } per transcript, so
// grouping and window checks don't stat every file a second time. Follows
// symlinks with a cycle guard: physical directories are keyed by path
// (cheap, collision-free); only directories reached through a symlink pay
// for realpath, which is also the only way a cycle or shared subtree can
// appear. Unstattable files stay in the result with mtimeMs -Infinity — the
// read step decides what that means (a read failure withholds the session).
// Unlistable directories are reported through channels.failedDirs.
function walkClaudeTranscripts(
    dir: string,
    out: Omit<WalkedFile, 'sid'>[],
    channels: WalkChannels = {},
    viaLink = false,
): Omit<WalkedFile, 'sid'>[] {
    channels.seenDirs ??= new Set();
    const key = viaLink ? claudeRealKey(dir) : dir;
    if (channels.seenDirs.has(key)) return out;
    channels.seenDirs.add(key);
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        channels.failedDirs?.push(dir);
        return out;
    }
    for (const e of entries) {
        const full = join(dir, e.name);
        const kind = direntStats(e, full);
        if (kind.dir) {
            walkClaudeTranscripts(
                full,
                out,
                channels,
                viaLink || e.isSymbolicLink(),
            );
        } else if (kind.file && CLAUDE_JSONL.test(e.name)) {
            let mtimeMs = -Infinity;
            try {
                mtimeMs = statSync(full).mtimeMs;
            } catch {
                /* keep the file; the read step decides */
            }
            out.push({ path: full, mtimeMs });
        }
    }
    return out;
}

// ------------------------------------------------------ sibling discovery ----

function claudeProbeRootFile(sessionDir: string, files: Set<string>): void {
    try {
        const root = `${sessionDir}.jsonl`;
        if (statSync(root).isFile()) files.add(root);
    } catch {
        /* no root transcript */
    }
}

function claudeAddSubagentFiles(
    sessionDir: string,
    files: Set<string>,
    failedDirs?: string[],
): void {
    let entries;
    try {
        entries = readdirSync(sessionDir, { withFileTypes: true });
    } catch (err) {
        // The canonical session dir is speculative — a session with no
        // subagents has none, and that hides nothing. Only an EXISTING
        // directory that cannot be listed may conceal contributions.
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code !== 'ENOENT' && code !== 'ENOTDIR')
            failedDirs?.push(sessionDir);
        return;
    }
    for (const e of entries) {
        const full = join(sessionDir, e.name);
        if (
            e.name.toLowerCase() === CLAUDE_SUBAGENT_DIR &&
            direntStats(e, full).dir
        )
            for (const f of walkClaudeTranscripts(full, [], { failedDirs }))
                files.add(f.path);
    }
}

/**
 * The transcript files of the session `path` belongs to that live beside it:
 * the root `<sid>.jsonl` plus everything under `<sid>/subagents/`, searched
 * recursively for the nested workflow-subagent layout. Used by the sessionend
 * hook, which is handed one path but must report the whole session.
 * `failedDirs`, when provided, collects unlistable directories inside the
 * session's tree so the caller can withhold the session.
 */
export function claudeSessionSiblings(
    path: string,
    failedDirs?: string[],
): string[] {
    const subagentSessionDir = claudeSessionDirOf(path, claudeStopDirFor(path));
    const sessionDir =
        subagentSessionDir ?? join(dirname(path), claudeStem(path));
    const stem = basename(sessionDir).toLowerCase();
    const parent = dirname(sessionDir);
    // The hooked file always participates — the read step decides whether it
    // is usable, so an unreadable file withholds its session instead of
    // letting a partial total slip through without it.
    const files = new Set<string>([path]);
    const sessionDirs = subagentSessionDir === null ? [] : [subagentSessionDir];
    // Discover the session's root file(s) and session directory case-variants
    // by readdir, so differing name casing still matches on a case-sensitive
    // filesystem.
    try {
        for (const e of readdirSync(parent, { withFileTypes: true })) {
            const full = join(parent, e.name);
            const kind = direntStats(e, full);
            if (
                kind.file &&
                CLAUDE_JSONL.test(e.name) &&
                e.name.replace(CLAUDE_JSONL, '').toLowerCase() === stem
            )
                files.add(full);
            else if (
                kind.dir &&
                e.name.toLowerCase() === stem &&
                full !== subagentSessionDir
            )
                sessionDirs.push(full);
        }
    } catch {
        // Parent unlistable — fall back to the canonical names, which remain
        // accessible by exact path (e.g. a traversable-but-unlistable 0o711
        // directory). Root-hooked: walk the canonical session dir so the
        // subagents tree isn't lost. Subagent-hooked: probe the canonical
        // root. Only a case-VARIANT name is unreachable here, by construction.
        if (subagentSessionDir === null) sessionDirs.push(sessionDir);
        else claudeProbeRootFile(subagentSessionDir, files);
    }
    for (const dir of sessionDirs)
        claudeAddSubagentFiles(dir, files, failedDirs);
    return [...files];
}

// -------------------------------------------------------------- grouping ----

// How much of a transcript's head to scan for its embedded session id. The id
// is normally on the first line; subagent files that carry it later fall back
// to the (correct) path-derived id, so a deeper scan buys nothing. The buffer
// is reused — the reporter is synchronous and single-threaded.
const CLAUDE_PEEK_BYTES = 16 * 1024;
const CLAUDE_PEEK_BUF = Buffer.alloc(CLAUDE_PEEK_BYTES);

/**
 * The first non-empty embedded sessionId within the head of the file, or null.
 * Grouping by this (instead of the filename) keeps a copied or renamed
 * transcript in the same session as the files it duplicates.
 */
export function claudeEmbeddedSessionId(path: string): string | null {
    let fd: number | null = null;
    try {
        fd = openSync(path, 'r');
        // Loop until the peek window is full or EOF — a single readSync may
        // return short on network filesystems.
        let n = 0;
        for (;;) {
            const got = readSync(
                fd,
                CLAUDE_PEEK_BUF,
                n,
                CLAUDE_PEEK_BYTES - n,
                n,
            );
            if (got <= 0) break;
            n += got;
            if (n >= CLAUDE_PEEK_BYTES) break;
        }
        for (const obj of jsonlObjects(
            CLAUDE_PEEK_BUF.toString('utf8', 0, n),
        )) {
            if (typeof obj.sessionId === 'string' && obj.sessionId)
                return obj.sessionId;
        }
    } catch {
        /* unreadable — grouping falls back to the path-derived id */
    } finally {
        try {
            if (fd !== null) closeSync(fd);
        } catch {
            /* a failed close must not abort the whole run */
        }
    }
    return null;
}

/**
 * Attribute an unlistable directory to the sessions it may hide files of:
 * the session named by the directory layout (second path segment under the
 * root) AND the embedded ids of every visible file belonging to that session
 * dir — rows key on embedded ids, which can differ from the directory name.
 * An unlistable project dir (or the root itself) cannot be attributed and
 * stays best effort. Matching is case-insensitive, like session state.
 */
function claudeAttributeFailedDir(
    failed: string,
    root: string,
    walked: WalkedFile[],
    failedDirSids: Set<string>,
): void {
    const segments = failed.slice(root.length).split(sep).filter(Boolean);
    const [projSeg, sessionSeg] = segments;
    if (!projSeg || !sessionSeg) return;
    failedDirSids.add(sessionSeg.toLowerCase());
    const projDir = join(root, projSeg).toLowerCase();
    const sessionPrefix = `${join(projDir, sessionSeg)}${sep}`.toLowerCase();
    const stem = sessionSeg.toLowerCase();
    for (const f of walked) {
        const lower = f.path.toLowerCase();
        const inSessionTree =
            lower.startsWith(sessionPrefix) ||
            (dirname(lower) === projDir && claudeStem(lower) === stem);
        if (inSessionTree) failedDirSids.add(f.sid.toLowerCase());
    }
}

/**
 * All local Claude transcripts grouped by session: each file's first embedded
 * sessionId when present, else its path-derived id. Grouping on the embedded
 * id makes filename/id mismatches (copied or resumed transcripts) land in the
 * session they actually record, in a single deterministic pass. Session ids
 * whose files may be partly hidden behind an unlistable directory are
 * returned in failedDirSids — their rows must be withheld, not uploaded as
 * partials.
 */
function claudeSessionGroups(): {
    groups: SessionGroups;
    failedDirSids: Set<string>;
} {
    const groups: SessionGroups = new Map();
    const failedDirSids = new Set<string>();
    // Symlinked roots (~/.config/claude -> ~/.claude) must not double-walk;
    // one shared seenDirs also dedups subtrees shared between roots.
    const seenRoots = new Set<string>();
    const seenDirs = new Set<string>();
    for (const d of claudeDirs()) {
        const rootKey = claudeRealKey(d);
        if (seenRoots.has(rootKey)) continue;
        seenRoots.add(rootKey);
        const failedDirs: string[] = [];
        const walked: WalkedFile[] = [];
        for (const f of walkClaudeTranscripts(d, [], {
            failedDirs,
            seenDirs,
        })) {
            const sid =
                claudeEmbeddedSessionId(f.path) ??
                claudeSessionIdFromPath(f.path, d);
            walked.push({ ...f, sid });
        }
        for (const f of walked) {
            const key = f.sid.toLowerCase();
            const group = groups.get(key);
            if (group) group.push(f);
            else groups.set(key, [f]);
        }
        for (const failed of failedDirs)
            claudeAttributeFailedDir(failed, d, walked, failedDirSids);
    }
    return { groups, failedDirSids };
}

// ----------------------------------------------------------- aggregation ----

interface SessionState {
    sid: string;
    startedAt: number | null;
    keyed: Map<string, ClaudeUsageRow>;
    unkeyed: ClaudeUsageRow[];
}

interface ReadStats {
    failedPaths: string[];
    missingPaths: string[];
}

/**
 * Read and aggregate a set of transcript files into per-session state, keyed
 * by lowercased session id (first-seen casing preserved for the row). Rows
 * sharing a message/request key dedupe last-wins ACROSS a session's files —
 * a copied transcript's chunks collapse against the original's. Files are
 * read one at a time; a file that cannot be read is recorded in stats
 * (missing vs failed split so the caller can decide what each means).
 */
function aggregateClaudeFiles(
    files: WalkedFile[],
    stats: ReadStats,
): Map<string, SessionState> {
    const sessions = new Map<string, SessionState>();
    const seenPaths = new Set<string>();
    for (const file of files) {
        const key = claudeRealKey(file.path);
        if (seenPaths.has(key)) continue;
        seenPaths.add(key);
        let text: string;
        try {
            text = readFileSync(file.path, 'utf8');
        } catch (err) {
            // The caller decides what a vanished file means: a missing
            // hook path has no contribution to protect, while a walked
            // file vanishing mid-run is a race worth withholding.
            const code = (err as NodeJS.ErrnoException)?.code;
            if (code === 'ENOENT') stats.missingPaths.push(file.path);
            else stats.failedPaths.push(file.path);
            continue;
        }
        const scan = scanClaudeTranscript(text);
        const sid = scan.sessionId || file.sid;
        const stateKey = sid.toLowerCase();
        let state = sessions.get(stateKey);
        if (!state) {
            state = { sid, startedAt: null, keyed: new Map(), unkeyed: [] };
            sessions.set(stateKey, state);
        }
        for (const [k, row] of scan.keyed) state.keyed.set(k, row);
        state.unkeyed.push(...scan.unkeyed);
        const fileStart =
            scan.startedAt ??
            (Number.isFinite(file.mtimeMs) ? file.mtimeMs : null);
        if (
            fileStart !== null &&
            (state.startedAt === null || fileStart < state.startedAt)
        )
            state.startedAt = fileStart;
    }
    return sessions;
}

function sessionRows(sessions: Map<string, SessionState>): ReporterRow[] {
    const rows: ReporterRow[] = [];
    for (const s of sessions.values()) {
        rows.push(
            ...toRows({
                session_id: s.sid,
                started_at: s.startedAt,
                models: sumClaudeRows([...s.keyed.values(), ...s.unkeyed]),
            }),
        );
    }
    return rows;
}

/**
 * Resolve hook-provided paths against the walked corpus, so a path never
 * appears twice with conflicting ids: an in-corpus path just selects its
 * (already-peeked) group, while a genuinely out-of-corpus transcript is
 * returned as an extra with the hook id as its id of last resort (catch-up
 * will never see that file, so no split-id risk). Literal path matches are
 * tried first — the common case — and only a miss pays for the corpus-wide
 * realpath index.
 */
function claudeResolveExtras(
    groups: SessionGroups,
    extraPaths: string[],
    extraFallbackSid: string | undefined,
    selected: Set<string>,
): WalkedFile[] {
    const extras: WalkedFile[] = [];
    if (extraPaths.length === 0) return extras;
    const knownByPath = new Map<string, WalkedFile>();
    for (const group of groups.values())
        for (const f of group) knownByPath.set(f.path, f);
    let knownByReal: Map<string, WalkedFile> | null = null;
    for (const path of extraPaths) {
        let known = knownByPath.get(path);
        if (known === undefined) {
            knownByReal ??= claudeRealIndex(groups);
            known = knownByReal.get(claudeRealKey(path));
        }
        if (known) {
            selected.add(known.sid.toLowerCase());
            continue;
        }
        const sid =
            claudeEmbeddedSessionId(path) ??
            extraFallbackSid ??
            claudeSessionIdFromPath(path);
        extras.push({ path, sid, mtimeMs: -Infinity });
    }
    return extras;
}

export interface ClaudeSessionRowsResult {
    rows: ReporterRow[];
    fileCount: number;
    sessionCount: number;
}

/**
 * Aggregate every session with at least one file modified after `sinceMs`
 * (every session when sinceMs <= 0) into API rows, one per (session, model).
 *
 * The server upsert REPLACES a row per (session, model), so: never upload a
 * session's row unless every known contribution to it was read. Grouping
 * keys on the EMBEDDED session id, so the window check sees all of a
 * session's files even when a filename doesn't match the id inside; any
 * produced row whose session id owns an unselected group (an id that only
 * appears deep inside another group's file) expands the selection and the
 * whole set is re-aggregated so those fragments merge under shared dedup;
 * and a session with an unreadable file, a walked file that vanished
 * mid-run, or an unlistable directory in its tree is withheld from the
 * upload entirely, leaving the server's existing row intact.
 *
 * `extraPaths` (the sessionend hook's sibling set, which may live outside
 * the walked corpus) join the selection with `extraFallbackSid` as their id
 * of last resort; `extraFailedSids` are withheld unconditionally (the hook's
 * own tree reported a listing failure).
 */
export function collectClaudeSessionRows(
    sinceMs: number,
    extraPaths: string[] = [],
    extraFallbackSid?: string,
    extraFailedSids: string[] = [],
): ClaudeSessionRowsResult {
    const { groups, failedDirSids } = claudeSessionGroups();
    const selected = new Set<string>();
    for (const [key, group] of groups) {
        if (sinceMs <= 0 || group.some((f) => f.mtimeMs >= sinceMs))
            selected.add(key);
    }
    const extras = claudeResolveExtras(
        groups,
        extraPaths,
        extraFallbackSid,
        selected,
    );
    const extraPathSet = new Set(extras.map((e) => e.path));
    let sessions: Map<string, SessionState>;
    let withheld: string[];
    let sidByPath: Map<string, string>;
    for (;;) {
        const files = [...extras];
        for (const key of selected) files.push(...(groups.get(key) ?? []));
        sidByPath = new Map(files.map((f) => [f.path, f.sid]));
        const stats: ReadStats = { failedPaths: [], missingPaths: [] };
        sessions = aggregateClaudeFiles(files, stats);
        // Unreadable files withhold their session. So does a walked file
        // that vanished between walk and read (a transient race — the next
        // run sees consistent state); a missing hook-provided extra simply
        // has no contribution to protect.
        withheld = stats.failedPaths.concat(
            stats.missingPaths.filter((path) => !extraPathSet.has(path)),
        );
        const expand = [...sessions.keys()].filter(
            (k) => groups.has(k) && !selected.has(k),
        );
        if (expand.length === 0) break;
        for (const k of expand) selected.add(k);
    }
    const failedSids = new Set<string>(failedDirSids);
    for (const sid of extraFailedSids) failedSids.add(sid.toLowerCase());
    for (const path of withheld) {
        const sid = sidByPath.get(path);
        if (sid) failedSids.add(sid.toLowerCase());
    }
    if (withheld.length > 0 || failedSids.size > 0) {
        process.stderr.write(
            `tokenmaxer: ${withheld.length} unreadable transcript(s), ` +
                `${failedDirSids.size} unlistable session folder(s); ` +
                `withheld ${failedSids.size} session(s) from this upload\n`,
        );
    }
    for (const key of failedSids) sessions.delete(key);
    const rows = sessionRows(sessions);
    return {
        rows,
        fileCount: sidByPath.size,
        sessionCount: sessions.size,
    };
}
