-- A shared cache for lookups that are slow, rate-limited or cost money (MusicBrainz, iTunes,
-- Claude). Rows past expires_at are ignored by reads and removed by an hourly clean-up.
CREATE TABLE cache_entries (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX cache_entries_expires_at ON cache_entries (expires_at);
