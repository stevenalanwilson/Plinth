-- An account's saved crate, one row per album. An album taken out of the crate is not deleted but
-- kept as a marker (item is null, removed_at says when), so another device that still has it
-- learns to drop it rather than bring it back. Markers are cleared out after 60 days, and so are
-- unrated picks past the same limits the browser uses; see libraryMerge.ts.
--
-- item_key is the album's artist and title in lower case, which is what tells two copies of an
-- album apart from two albums. updated_at is when the server last changed the row, which is how
-- a device asks for "everything since I last heard".
CREATE TABLE library_items (
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  item_key text NOT NULL,
  item jsonb,
  removed_at timestamptz,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, item_key),
  CHECK ((item IS NULL) <> (removed_at IS NULL))
);

CREATE INDEX library_items_updated_at ON library_items (account_id, updated_at);
