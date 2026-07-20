export const CATCHUP_DAYS =
    Number.parseInt(
        process.env.TOKENMAXER_DAYS ?? process.env.TOKENTALLY_DAYS ?? '3',
        10,
    ) || 3;

export const MAX_SESSIONS_PER_REQUEST = 200;

// Bulk history backfill posts to a separate endpoint in larger chunks.
export const HISTORY_CHUNK = 500;

// --dry-run (any command): print the exact payloads to stdout instead of POSTing.
export const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) process.argv = process.argv.filter((a) => a !== '--dry-run');
