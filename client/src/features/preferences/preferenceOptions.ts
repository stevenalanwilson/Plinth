// The genres and moods people can choose. Presets are typed against these, so one can't name a
// genre the panel doesn't offer.
export const GENRE_OPTIONS = [
  'Electronic',
  'Post-punk',
  'Ambient',
  'Indie',
  'Krautrock',
  'Drum & Bass',
  'Art Rock',
  'Jazz',
  'Folk',
  'Metal',
  'Hip-hop',
  'Classical',
] as const;

export const MOOD_OPTIONS = [
  'Late night',
  'High energy',
  'Chill',
  'Focus',
  'Melancholic',
  'Euphoric',
  'Hopeful',
] as const;

export type Genre = (typeof GENRE_OPTIONS)[number];
export type Mood = (typeof MOOD_OPTIONS)[number];
