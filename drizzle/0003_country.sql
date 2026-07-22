-- Required signup country (ISO 3166-1 alpha-2). Existing rows backfill to AU;
-- the DEFAULT exists only to satisfy the NOT NULL add for those rows — new
-- signups always supply a country explicitly.
ALTER TABLE users ADD COLUMN country TEXT NOT NULL DEFAULT 'AU';
CREATE INDEX IF NOT EXISTS idx_users_country ON users (country);
