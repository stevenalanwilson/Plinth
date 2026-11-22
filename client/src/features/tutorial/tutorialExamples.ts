import { Genre, Mood } from '../preferences/preferenceOptions';

export interface TutorialExample {
  readonly vibe: string;
  readonly genre: Genre;
  readonly mood: Mood;
  readonly artist: string;
  readonly album: string;
  readonly year: string;
  readonly hook: string;
}

// Hand-picked rather than live picks, so the demo never depends on what's in the database.
export const TUTORIAL_EXAMPLES: readonly TutorialExample[] = [
  {
    vibe: 'Rain on the window, nowhere to be',
    genre: 'Jazz',
    mood: 'Late night',
    artist: 'Miles Davis',
    album: 'Kind of Blue',
    year: '1959',
    hook: 'Unhurried and smoky, made for the hour after everyone else has gone to bed.',
  },
];

// A few pills each, as in the real panel, so the one chosen stands out from the rest.
export const TUTORIAL_GENRES: readonly Genre[] = ['Jazz', 'Folk', 'Post-punk', 'Electronic'];
export const TUTORIAL_MOODS: readonly Mood[] = ['Late night', 'Chill', 'Melancholic', 'Euphoric'];
