import { Era, RecommendationPreferences } from '@shared/types';
import { DEFAULT_PREFERENCES } from '../../hooks/useRecommendation';
import { Genre, Mood } from '../preferences/preferenceOptions';

export interface VibePreset {
  readonly label: string;
  /** Goes in the vibe box, where it gives Claude more to go on than the controls alone. */
  readonly vibeQuery: string;
  readonly preferences: RecommendationPreferences;
}

interface PresetSettings {
  readonly genres: readonly Genre[];
  readonly moods: readonly Mood[];
  readonly tempo: number;
  readonly energy: number;
  readonly density: number;
  readonly era: Era;
}

function preset(label: string, vibeQuery: string, settings: PresetSettings): VibePreset {
  // Starts from the defaults so a preset leaves nothing behind from earlier choices.
  return { label, vibeQuery, preferences: { ...DEFAULT_PREFERENCES, ...settings } };
}

export const VIBE_PRESETS: readonly VibePreset[] = [
  preset('Rainy Sunday krautrock', 'A rainy Sunday afternoon, hypnotic and unhurried', {
    genres: ['Krautrock'],
    moods: ['Chill'],
    tempo: 4,
    energy: 4,
    density: 5,
    era: 'pre-80s',
  }),
  preset('3am post-punk', 'Walking home at 3am, wired and a little bleak', {
    genres: ['Post-punk'],
    moods: ['Late night', 'Melancholic'],
    tempo: 6,
    energy: 6,
    density: 5,
    era: '80s-90s',
  }),
  preset('Ambient for deep work', 'Hours of deep work, nothing that grabs my attention', {
    genres: ['Ambient'],
    moods: ['Focus'],
    tempo: 2,
    energy: 2,
    density: 3,
    era: 'any',
  }),
  preset('Sunday morning folk', 'A slow Sunday morning, coffee and sunlight', {
    genres: ['Folk'],
    moods: ['Hopeful', 'Chill'],
    tempo: 3,
    energy: 3,
    density: 3,
    era: 'any',
  }),
  preset('Late-night jazz', 'After midnight, lights low, a drink in hand', {
    genres: ['Jazz'],
    moods: ['Late night'],
    tempo: 4,
    energy: 3,
    density: 4,
    era: 'any',
  }),
  preset('Something heavy', 'Loud, dense and relentless', {
    genres: ['Metal'],
    moods: ['High energy'],
    tempo: 8,
    energy: 9,
    density: 9,
    era: 'any',
  }),
  preset(
    'Night drive electronic',
    'Driving through the city at night, all neon and motorway lights',
    {
      genres: ['Electronic'],
      moods: ['Late night'],
      tempo: 6,
      energy: 5,
      density: 5,
      era: 'any',
    },
  ),
  preset('Euphoric drum & bass', 'Arms in the air, bass you can feel in your chest', {
    genres: ['Drum & Bass'],
    moods: ['Euphoric', 'High energy'],
    tempo: 9,
    energy: 9,
    density: 8,
    era: 'any',
  }),
  preset('Boom bap hip-hop', 'Crate-dug samples and a beat to nod along to on the bus', {
    genres: ['Hip-hop'],
    moods: ['Chill'],
    tempo: 5,
    energy: 6,
    density: 6,
    era: '80s-90s',
  }),
  preset('Classical for reading', 'A quiet evening with a book, nothing with words', {
    genres: ['Classical'],
    moods: ['Focus', 'Chill'],
    tempo: 3,
    energy: 3,
    density: 4,
    era: 'any',
  }),
  preset('Road trip indie', 'Windows down on a summer road trip, singing along', {
    genres: ['Indie'],
    moods: ['Hopeful', 'High energy'],
    tempo: 7,
    energy: 7,
    density: 6,
    era: '00s-10s',
  }),
  preset('Heartbreak indie', 'Getting over someone, sad but beautiful', {
    genres: ['Indie'],
    moods: ['Melancholic'],
    tempo: 4,
    energy: 4,
    density: 5,
    era: 'any',
  }),
  preset('Art rock rabbit hole', 'Headphones on, something strange and layered to get lost in', {
    genres: ['Art Rock'],
    moods: ['Focus'],
    tempo: 5,
    energy: 5,
    density: 7,
    era: 'any',
  }),
  preset('Motorik for working', 'A long, repetitive groove to lose track of time to', {
    genres: ['Krautrock'],
    moods: ['Focus'],
    tempo: 6,
    energy: 5,
    density: 5,
    era: 'pre-80s',
  }),
  preset('Winter ambient', 'Snow falling outside, cold and still', {
    genres: ['Ambient'],
    moods: ['Melancholic', 'Chill'],
    tempo: 2,
    energy: 2,
    density: 3,
    era: 'any',
  }),
  preset('Spiritual jazz', 'Searching and joyful, horns reaching for something bigger', {
    genres: ['Jazz'],
    moods: ['Euphoric', 'Hopeful'],
    tempo: 5,
    energy: 6,
    density: 6,
    era: 'pre-80s',
  }),
  preset('Post-punk to dance to', 'Angular guitars and a bassline you can dance to', {
    genres: ['Post-punk'],
    moods: ['High energy'],
    tempo: 7,
    energy: 7,
    density: 6,
    era: '80s-90s',
  }),
  preset('Campfire folk', 'Around a fire outdoors, voices and acoustic guitars', {
    genres: ['Folk'],
    moods: ['Hopeful'],
    tempo: 4,
    energy: 4,
    density: 3,
    era: 'any',
  }),
];

/** How many presets show at once; a different handful each time the page loads. */
export const PRESETS_SHOWN = 6;

/** A random handful of the presets, in a random order, with no preset twice. */
export function choosePresets(
  presets: readonly VibePreset[],
  count: number,
  random: () => number = Math.random,
): VibePreset[] {
  const shuffled = [...presets];
  // Fisher–Yates, stopped once the handful at the front has been drawn.
  const drawn = Math.min(count, shuffled.length);
  for (let index = 0; index < drawn; index += 1) {
    const pick = index + Math.floor(random() * (shuffled.length - index));
    [shuffled[index], shuffled[pick]] = [shuffled[pick], shuffled[index]];
  }
  return shuffled.slice(0, drawn);
}

function sameItems(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((item) => second.includes(item));
}

/**
 * True while the controls still hold exactly what the preset set, so changing any of them
 * unmarks it. Genres and moods are compared as sets, since the order they were tapped in
 * doesn't matter.
 */
export function isPresetApplied(
  preset: VibePreset,
  preferences: RecommendationPreferences,
  vibeQuery: string,
): boolean {
  const expected = preset.preferences;
  return (
    vibeQuery.trim() === preset.vibeQuery &&
    sameItems(preferences.genres, expected.genres) &&
    sameItems(preferences.moods, expected.moods) &&
    preferences.tempo === expected.tempo &&
    preferences.energy === expected.energy &&
    preferences.density === expected.density &&
    preferences.era === expected.era &&
    preferences.includeFamiliarArtists === expected.includeFamiliarArtists &&
    preferences.prioritiseObscure === expected.prioritiseObscure &&
    preferences.stayFocused === expected.stayFocused
  );
}
