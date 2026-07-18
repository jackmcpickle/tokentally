-- TokenTally initial schema
-- Users: no PII. The bearer token is stored only as a SHA-256 hash.
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL,
  username_lower TEXT NOT NULL,
  token_hash     TEXT NOT NULL,
  created_at     INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (username_lower);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_token_hash ON users (token_hash);

-- Cumulative, idempotent per-session usage. Re-reporting a session REPLACEs the row,
-- so SessionStart catch-up + SessionEnd reporting can never double-count.
CREATE TABLE IF NOT EXISTS session_usage (
  user_id               TEXT NOT NULL,
  source                TEXT NOT NULL,   -- 'claude_code' | 'codex'
  session_id            TEXT NOT NULL,
  model                 TEXT NOT NULL,
  input_tokens          INTEGER NOT NULL DEFAULT 0,
  output_tokens         INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens     INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens      INTEGER NOT NULL DEFAULT 0,
  started_at            INTEGER NOT NULL,   -- session start (ms) — used for timeframe bucketing
  updated_at            INTEGER NOT NULL,   -- last report (ms)
  PRIMARY KEY (user_id, source, session_id, model),
  FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX IF NOT EXISTS idx_session_usage_started_at ON session_usage (started_at);
CREATE INDEX IF NOT EXISTS idx_session_usage_user ON session_usage (user_id);
