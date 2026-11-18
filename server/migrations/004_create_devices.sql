-- A browser or app that has asked for a token, so the server can tell one visitor's requests from
-- another's without an account. Only a hash of the token is kept, so a copy of this table can't be
-- used to act as anyone. A device not seen for a year is removed by a daily clean-up.
CREATE TABLE devices (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL
);

CREATE INDEX devices_last_seen_at ON devices (last_seen_at);
