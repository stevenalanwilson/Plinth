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
];

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
