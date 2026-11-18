-- An account is an email address someone has proved they can read. Signing in links the device
-- they are on to it, so a device is either anonymous (account_id is null) or signed in.
-- Deleting an account unlinks its devices rather than removing them.
CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL
);

ALTER TABLE devices ADD COLUMN account_id uuid REFERENCES accounts (id) ON DELETE SET NULL;

CREATE INDEX devices_account_id ON devices (account_id);

-- A link emailed to someone. Only a hash of its token is kept, so a copy of this table can't be
-- used to sign in. A link works once, until expires_at. Used and expired rows are kept for a day,
-- which is also what limits how many links one address can be sent.
CREATE TABLE sign_in_links (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE INDEX sign_in_links_email_created_at ON sign_in_links (email, created_at);
