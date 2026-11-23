-- A list of albums someone has put in order and can share, such as "My top 3 albums of all time".
-- Anyone with the link can read a list, so id is a short random code that can't be guessed.
--
-- A list belongs to one owner: a device while the person is anonymous, then their account once
-- they sign in (the list moves across then). kind and qualifier say what sort of list it is, so
-- lists of a genre, a month or a year need no new table; size is how many albums it can hold.
-- Each owner has one list for each kind and qualifier.
--
-- Deleting a device or an account deletes its lists.
CREATE TABLE lists (
  id text PRIMARY KEY,
  device_id uuid REFERENCES devices (id) ON DELETE CASCADE,
  account_id uuid REFERENCES accounts (id) ON DELETE CASCADE,
  kind text NOT NULL,
  qualifier text NOT NULL,
  size integer NOT NULL CHECK (size > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK ((device_id IS NULL) <> (account_id IS NULL))
);

CREATE UNIQUE INDEX lists_device_kind_qualifier ON lists (device_id, kind, qualifier)
  WHERE device_id IS NOT NULL;
CREATE UNIQUE INDEX lists_account_kind_qualifier ON lists (account_id, kind, qualifier)
  WHERE account_id IS NOT NULL;

-- The albums in a list, in order from position 1. An album can be in a list only once.
CREATE TABLE list_items (
  list_id text NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  release_group_id uuid NOT NULL REFERENCES albums (release_group_id),
  PRIMARY KEY (list_id, position),
  UNIQUE (list_id, release_group_id)
);
