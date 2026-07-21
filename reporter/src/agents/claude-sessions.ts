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
    existsSync,
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
import type { ClaudeFileScan, ClaudeUsageRow } from './claude';
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

// Physical file identity. dev:ino is immune to path spelling — APFS is
// case-insensitive but realpathSync does not canonicalize case, so a
// case-variant hook path would otherwise read the same transcript twice and
// double-count its unkeyed rows. Memoized for the run: identity is stable
// for the process lifetime and this sits on the collector's hot path.
const realKeyMemo = new Map<string, string>();

function claudeRealKey(path: string): string {
    const memo = realKeyMemo.get(path);
    if (memo !== undefined) return memo;
    let key: string;
    try {
        const st = statSync(path);
        key = `${st.dev}:${st.ino}`;
    } catch {
        try {
            key = realpathSync(path);
        } catch {
            key = path;
        }
    }
    realKeyMemo.set(path, key);
    return key;
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
                const st = statSync(full);
                mtimeMs = st.mtimeMs;
                // The same stat also yields the file's identity key —
                // seeding the memo here halves stat traffic on the
                // collector's hot path.
                realKeyMemo.set(full, `${st.dev}:${st.ino}`);
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
    const stopDir = claudeStopDirFor(path);
    let subagentSessionDir = claudeSessionDirOf(path, stopDir);
    if (subagentSessionDir !== null && stopDir === null) {
        // Out-of-corpus paths have no walk root to bound the ancestor scan,
        // so a directory merely NAMED subagents (a backup folder) would make
        // its parent the presumed session dir and sweep unrelated
        // transcripts into the upload. Trust the layout only when the
        // hooked file's embedded session id names that dir; a file with no
        // embedded id keeps the layout rule (nothing better to key on).
        const embedded = claudeEmbeddedSessionId(path);
        if (
            embedded !== null &&
            embedded.toLowerCase() !==
                basename(subagentSessionDir).toLowerCase()
        ) {
            subagentSessionDir = null;
        }
    }
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

// One sessionend run can peek the same head from several call sites
// (sibling layout validation, failure attribution, extras resolution); file
// identity is treated as stable for the process lifetime, like realKeyMemo.
// Unreadable results are cached too — a transient-read distinction buys
// nothing here because grouping falls back to the path-derived id either way.
const embeddedSidMemo = new Map<string, string | null>();

/**
 * The first non-empty embedded sessionId within the head of the file, or null.
 * Grouping by this (instead of the filename) keeps a copied or renamed
 * transcript in the same session as the files it duplicates.
 */
export function claudeEmbeddedSessionId(path: string): string | null {
    const memo = embeddedSidMemo.get(path);
    if (memo !== undefined) return memo;
    const sid = claudePeekSessionId(path);
    embeddedSidMemo.set(path, sid);
    return sid;
}

function claudePeekSessionId(path: string): string | null {
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
    failedDirPaths: string[];
} {
    const groups: SessionGroups = new Map();
    const failedDirSids = new Set<string>();
    const failedDirPaths: string[] = [];
    // Symlinked roots (~/.config/claude -> ~/.claude) must not double-walk;
    // one shared seenDirs also dedups subtrees shared between roots.
    const seenRoots = new Set<string>();
    const seenDirs = new Set<string>();
    for (const d of claudeDirs()) {
        // An absent root (e.g. no ~/.config/claude on this machine) has
        // nothing to walk — it must not read as an unlistable folder.
        if (!existsSync(d)) continue;
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
        for (const failed of failedDirs) {
            failedDirPaths.push(failed);
            claudeAttributeFailedDir(failed, d, walked, failedDirSids);
            // A project-level (or root-level) unlistable dir can hide files
            // of ANY session; nothing can attribute it, so it stays best
            // effort — but silently would be worse.
            if (claudeTreePathOfDir(failed) === null) {
                process.stderr.write(
                    'tokenmaxer: an unlistable folder above the session ' +
                        'level may hide transcripts; its sessions cannot ' +
                        'be withheld precisely\n',
                );
            }
        }
    }
    return { groups, failedDirSids, failedDirPaths };
}

// ----------------------------------------------------------- aggregation ----

// One keyed row plus where it came from, for cross-file reconciliation.
interface KeyedClaudeRow {
    row: ClaudeUsageRow;
    subagentPath: boolean;
    path: string;
}

interface SessionState {
    sid: string;
    startedAt: number | null;
    keyed: Map<string, KeyedClaudeRow>;
    unkeyed: ClaudeUsageRow[];
}

interface ReadStats {
    failedPaths: string[];
    missingPaths: string[];
}

// CodexBar's cross-file winner rule for one message/request key appearing in
// several of a session's files: the NON-sidechain row beats a sidechain copy
// and the parent transcript's row beats a subagents/ copy (the parent file
// carries the final cumulative chunk; sidechain/subagent copies can be stale
// partials), then the lexicographically smaller path wins — deterministic
// regardless of file iteration order.
function claudeRowWins(a: KeyedClaudeRow, b: KeyedClaudeRow): boolean {
    if (a.row.sidechain !== b.row.sidechain) return b.row.sidechain;
    if (a.subagentPath !== b.subagentPath) return b.subagentPath;
    return a.path < b.path;
}

/**
 * Read and aggregate a set of transcript files into per-session state, keyed
 * by lowercased session id (first-seen casing preserved for the row). Rows
 * sharing a message/request key dedupe last-wins WITHIN a file (streamed
 * chunks) and by CodexBar's deterministic winner rule ACROSS a session's
 * files — a copied transcript's chunks collapse against the original's.
 * Files are read one at a time; a file that cannot be read is recorded in
 * stats (missing vs failed split so the caller can decide what each means).
 */
function mergeScanIntoState(
    state: SessionState,
    scan: ClaudeFileScan,
    path: string,
): void {
    const subagentPath = path.toLowerCase().includes(`${sep}subagents${sep}`);
    for (const [k, row] of scan.keyed) {
        const candidate = { row, subagentPath, path };
        const incumbent = state.keyed.get(k);
        if (!incumbent || claudeRowWins(candidate, incumbent)) {
            state.keyed.set(k, candidate);
        }
    }
    // No spread: a pathological transcript with 100k+ unkeyed rows would
    // blow the call stack and crash the whole collection run.
    for (const row of scan.unkeyed) state.unkeyed.push(row);
}

function aggregateClaudeFiles(
    files: WalkedFile[],
    stats: ReadStats,
    scanCache?: Map<string, ClaudeFileScan>,
    sessionKeyByPath?: Map<string, string>,
): Map<string, SessionState> {
    const sessions = new Map<string, SessionState>();
    const seenPaths = new Set<string>();
    for (const file of files) {
        const key = claudeRealKey(file.path);
        if (seenPaths.has(key)) continue;
        seenPaths.add(key);
        // The expansion closure re-aggregates the whole selection each
        // round; successful scans are cached so a round only reads files it
        // hasn't seen (read errors are never cached — transient).
        let scan = scanCache?.get(key);
        if (!scan) {
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
            scan = scanClaudeTranscript(text);
            scanCache?.set(key, scan);
        }
        const sid = scan.sessionId || file.sid;
        const stateKey = sid.toLowerCase();
        // Which session each read file fed: a failed sibling from the same
        // session tree must withhold that session even when its key is an
        // embedded id the failed file's own sid never named.
        sessionKeyByPath?.set(file.path, stateKey);
        let state = sessions.get(stateKey);
        if (!state) {
            state = { sid, startedAt: null, keyed: new Map(), unkeyed: [] };
            sessions.set(stateKey, state);
        }
        mergeScanIntoState(state, scan, file.path);
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
                models: sumClaudeRows([
                    ...[...s.keyed.values()].map((k) => k.row),
                    ...s.unkeyed,
                ]),
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
    // Sessions dropped from the upload because part of their tree was
    // unreadable — backfill must not report clean success over them.
    withheldSessions: number;
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
// Session-tree key for scoping withholding: the session directory's FULL
// path, so an unlistable dir in one project can never withhold a healthy,
// identically-named session tree in another project.
function claudeTreePathOfFile(path: string): string {
    const sessionDir =
        claudeSessionDirOf(path, claudeStopDirFor(path)) ??
        join(dirname(path), claudeStem(path));
    return sessionDir.toLowerCase();
}

// The session tree a directory belongs to, or null for a project-level (or
// root-level) directory that no session-tree rule can attribute. In-corpus,
// the layout fixes the depth — <root>/<project>/<sessionDir>/... — so the
// unlistable dir may BE the session dir itself (no subagents component in
// its own path). Out-of-corpus dirs fall back to the subagents rule.
function claudeTreePathOfDir(dir: string): string | null {
    const stop = claudeStopDirFor(dir);
    if (stop !== null) {
        const segments = dir.slice(stop.length).split(sep).filter(Boolean);
        const [projSeg, sessionSeg] = segments;
        if (!projSeg || !sessionSeg) return null;
        return join(stop, projSeg, sessionSeg).toLowerCase();
    }
    return (
        claudeSessionDirOf(join(dir, 'x.jsonl'), null)?.toLowerCase() ?? null
    );
}

// Which sessions each session TREE (full session-dir path) fed, from the
// full-file scans. One pass keeps tree lookups O(files) overall.
function buildSessionKeysByTree(
    sessionKeyByPath: Map<string, string>,
): Map<string, Set<string>> {
    const sessionKeysByTree = new Map<string, Set<string>>();
    for (const [fpath, sessionKey] of sessionKeyByPath) {
        const tree = claudeTreePathOfFile(fpath);
        const keys = sessionKeysByTree.get(tree) ?? new Set<string>();
        keys.add(sessionKey);
        sessionKeysByTree.set(tree, keys);
    }
    return sessionKeysByTree;
}

// Files from a failed file's session TREE may have fed sessions keyed by a
// different embedded id (a readable root carrying a divergent sessionId,
// while the unreadable sibling could not be peeked and fell back to its
// path-derived id). Those aggregates are missing the failed file's usage and
// must be withheld too — never upload a partial over a fuller stored row.
// Mirrors what claudeAttributeFailedDir does for unlistable directories.
function addWithheldSids(
    withheld: string[],
    sidByPath: Map<string, string>,
    sessionKeysByTree: Map<string, Set<string>>,
    failedSids: Set<string>,
): void {
    for (const path of withheld) {
        const sid = sidByPath.get(path);
        if (!sid) continue;
        failedSids.add(sid.toLowerCase());
        for (const key of sessionKeysByTree.get(claudeTreePathOfFile(path)) ??
            []) {
            failedSids.add(key);
        }
    }
}

// Withholding through the session-tree association: an unlistable dir
// belongs to a session TREE whose sessions can key on embedded ids the dir
// attribution's head peeks missed (first line beyond the peek window);
// unreadable files withhold analogously. Trees are full session-dir paths —
// project-scoped, so identically-named sessions elsewhere stay unaffected.
// An unlistable PROJECT-level dir cannot be attributed to any tree and
// stays best effort (surfaced on stderr by the caller).
function applyTreeWithholding(
    withheld: string[],
    failedDirPaths: string[],
    sidByPath: Map<string, string>,
    sessionKeyByPath: Map<string, string>,
    failedSids: Set<string>,
): void {
    const sessionKeysByTree = buildSessionKeysByTree(sessionKeyByPath);
    for (const dir of failedDirPaths) {
        const tree = claudeTreePathOfDir(dir);
        if (tree === null) continue;
        for (const key of sessionKeysByTree.get(tree) ?? []) {
            failedSids.add(key);
        }
    }
    addWithheldSids(withheld, sidByPath, sessionKeysByTree, failedSids);
}

// Delete withheld sessions and count everything this run could not upload.
// A session whose only file(s) were unreadable never formed an aggregate to
// delete, but it still represents usage the run is missing — callers must
// not report clean success over it.
function countWithheldSessions(
    sessions: Map<string, SessionState>,
    failedSids: Set<string>,
    withheld: string[],
    sidByPath: Map<string, string>,
): number {
    let count = 0;
    const deletedKeys = new Set<string>();
    for (const key of failedSids) {
        if (sessions.delete(key)) {
            count += 1;
            deletedKeys.add(key);
        }
    }
    const ghostSids = new Set<string>();
    for (const path of withheld) {
        const sid = sidByPath.get(path)?.toLowerCase();
        if (sid && !deletedKeys.has(sid) && !sessions.has(sid)) {
            ghostSids.add(sid);
        }
    }
    return count + ghostSids.size;
}

// Withhold every session the hook-provided extras fed, keyed on the
// full-scan session ids the collector actually used.
function addExtraSessionSids(
    extras: WalkedFile[],
    sessionKeyByPath: Map<string, string>,
    failedSids: Set<string>,
): void {
    for (const extra of extras) {
        const key = sessionKeyByPath.get(extra.path);
        if (key) failedSids.add(key);
    }
}

export function collectClaudeSessionRows(
    sinceMs: number,
    extraPaths: string[] = [],
    extraFallbackSid?: string,
    extraFailedSids: string[] = [],
    exemptMissingPaths: string[] = [],
    // When the caller knows part of the hooked session's tree was
    // unreachable (an unlistable sibling dir), every session the extras fed
    // must be withheld — keyed on the full-scan session ids the collector
    // actually used, not on head peeks that can miss deep or absent ids.
    withholdExtraSessions = false,
): ClaudeSessionRowsResult {
    const { groups, failedDirSids, failedDirPaths } = claudeSessionGroups();
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
    const exemptMissing = new Set(exemptMissingPaths);
    const scanCache = new Map<string, ClaudeFileScan>();
    let sessions: Map<string, SessionState>;
    let withheld: string[];
    let sidByPath: Map<string, string>;
    let sessionKeyByPath: Map<string, string>;
    for (;;) {
        const files = [...extras];
        // No spread: a group with 100k+ files would blow the call stack.
        for (const key of selected) {
            for (const f of groups.get(key) ?? []) files.push(f);
        }
        sidByPath = new Map(files.map((f) => [f.path, f.sid]));
        const stats: ReadStats = { failedPaths: [], missingPaths: [] };
        sessionKeyByPath = new Map();
        sessions = aggregateClaudeFiles(
            files,
            stats,
            scanCache,
            sessionKeyByPath,
        );
        // Unreadable files withhold their session. So does ANY file that
        // vanished between discovery and read — including a sessionend
        // sibling listed moments earlier (a transient race; the next run
        // sees consistent state). Only the hook-provided transcript path
        // itself is exempt: when it never existed there is no contribution
        // to protect.
        withheld = stats.failedPaths.concat(
            stats.missingPaths.filter((path) => !exemptMissing.has(path)),
        );
        const expand = [...sessions.keys()].filter(
            (k) => groups.has(k) && !selected.has(k),
        );
        if (expand.length === 0) break;
        for (const k of expand) selected.add(k);
    }
    const failedSids = new Set<string>(failedDirSids);
    for (const sid of extraFailedSids) failedSids.add(sid.toLowerCase());
    if (withholdExtraSessions) {
        addExtraSessionSids(extras, sessionKeyByPath, failedSids);
    }
    if (withheld.length > 0 || failedDirPaths.length > 0) {
        applyTreeWithholding(
            withheld,
            failedDirPaths,
            sidByPath,
            sessionKeyByPath,
            failedSids,
        );
    }
    const withheldSessions = countWithheldSessions(
        sessions,
        failedSids,
        withheld,
        sidByPath,
    );
    if (withheld.length > 0 || failedSids.size > 0) {
        process.stderr.write(
            `tokenmaxer: ${withheld.length} unreadable transcript(s), ` +
                `${failedDirPaths.length} unlistable folder(s); ` +
                `withheld ${withheldSessions} session(s) from this upload\n`,
        );
    }
    const rows = sessionRows(sessions);
    return {
        rows,
        fileCount: sidByPath.size,
        sessionCount: sessions.size,
        withheldSessions,
    };
}
