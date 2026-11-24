// The genres (shared with lists) and moods people can choose. Presets are typed against these, so
// one can't name a genre the panel doesn't offer.
export const MOOD_OPTIONS = [
  'Late night',
  'High energy',
  'Chill',
  'Focus',
  'Melancholic',
  'Euphoric',
  'Hopeful',
] as const;

export { GENRE_OPTIONS } from '@shared/types';
export type { Genre } from '@shared/types';
export type Mood = (typeof MOOD_OPTIONS)[number];
