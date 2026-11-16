-- Albums that have a permalink. Public facts about a record, shared by every user: no user data.
CREATE TABLE albums (
  release_group_id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  artist text NOT NULL,
  album text NOT NULL,
  year text,
  hook text,
  genres text[] NOT NULL DEFAULT '{}',
  country text,
  created_at timestamptz NOT NULL DEFAULT now()
);
