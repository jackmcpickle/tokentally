-- Hackathon competitions: time-boxed contests scoped to a member set and an
-- optional single model family. Boards reuse the leaderboard aggregation.
CREATE TABLE hackathons (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    slug_lower TEXT NOT NULL,
    name TEXT NOT NULL,
    host_user_id TEXT NOT NULL,
    model_family TEXT,          -- NULL = all models count
    start_at INTEGER NOT NULL,  -- ms epoch (UTC)
    end_at INTEGER NOT NULL,    -- ms epoch (UTC)
    created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_hackathons_slug ON hackathons(slug_lower);
CREATE INDEX idx_hackathons_host ON hackathons(host_user_id);

CREATE TABLE hackathon_members (
    hackathon_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (hackathon_id, user_id)
);
CREATE INDEX idx_hackathon_members_user ON hackathon_members(user_id);

-- Browser sessions minted via the CLI `login` command. Cookie holds a random
-- opaque id; only its SHA-256 is persisted.
CREATE TABLE web_sessions (
    id_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX idx_web_sessions_expires ON web_sessions(expires_at);
