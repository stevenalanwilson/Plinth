-- Artwork is looked up once per album and kept, so permalink visits and link previews don't
-- call MusicBrainz, the Cover Art Archive or iTunes. artwork_checked_at is null until the first
-- lookup, and lets a missing cover be checked again later.
ALTER TABLE albums
  ADD COLUMN artwork_url text,
  ADD COLUMN apple_music_url text,
  ADD COLUMN artwork_checked_at timestamptz;
