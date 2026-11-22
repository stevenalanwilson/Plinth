import { describe, it, expect } from 'vitest';
import { ERA_VALUES, RecommendationPreferences, SLIDER_MAX, SLIDER_MIN } from '@shared/types';
import { DEFAULT_PREFERENCES } from '../../hooks/useRecommendation';
import { GENRE_OPTIONS, MOOD_OPTIONS } from '../preferences/preferenceOptions';
import { choosePresets, isPresetApplied, PRESETS_SHOWN, VIBE_PRESETS } from './presets';

// The vibe box's maxLength.
const MAX_VIBE_LENGTH = 300;

describe('VIBE_PRESETS', () => {
  it('has plenty more presets than show at once, with distinct labels', () => {
    const labels = VIBE_PRESETS.map((preset) => preset.label);

    expect(labels.length).toBeGreaterThanOrEqual(PRESETS_SHOWN * 2);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('gives every genre on offer at least one preset', () => {
    const covered = new Set(VIBE_PRESETS.flatMap((preset) => preset.preferences.genres));

    GENRE_OPTIONS.forEach((genre) => expect(covered).toContain(genre));
  });

  it.each(VIBE_PRESETS.map((preset) => [preset.label, preset] as const))(
    '%s only uses values the controls offer',
    (_label, preset) => {
      const { genres, moods, tempo, energy, density, era } = preset.preferences;

      expect(genres.length).toBeGreaterThan(0);
      genres.forEach((genre) => expect(GENRE_OPTIONS).toContain(genre));
      moods.forEach((mood) => expect(MOOD_OPTIONS).toContain(mood));
      [tempo, energy, density].forEach((value) => {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(SLIDER_MIN);
        expect(value).toBeLessThanOrEqual(SLIDER_MAX);
      });
      expect(ERA_VALUES).toContain(era);
      expect(preset.vibeQuery.trim()).toBe(preset.vibeQuery);
      expect(preset.vibeQuery.length).toBeGreaterThan(0);
      expect(preset.vibeQuery.length).toBeLessThanOrEqual(MAX_VIBE_LENGTH);
    },
  );

  it('keeps the default discovery settings', () => {
    VIBE_PRESETS.forEach((preset) => {
      expect(preset.preferences.includeFamiliarArtists).toBe(
        DEFAULT_PREFERENCES.includeFamiliarArtists,
      );
      expect(preset.preferences.prioritiseObscure).toBe(DEFAULT_PREFERENCES.prioritiseObscure);
      expect(preset.preferences.stayFocused).toBe(DEFAULT_PREFERENCES.stayFocused);
    });
  });
});

describe('isPresetApplied', () => {
  const preset = VIBE_PRESETS[1];
  const applied = preset.preferences;

  it('is true when the controls hold exactly the preset', () => {
    expect(isPresetApplied(preset, applied, preset.vibeQuery)).toBe(true);
  });

  it('ignores the order genres and moods were chosen in', () => {
    const reordered = { ...applied, moods: [...applied.moods].reverse() };

    expect(isPresetApplied(preset, reordered, preset.vibeQuery)).toBe(true);
  });

  it('ignores spaces around the vibe', () => {
    expect(isPresetApplied(preset, applied, ` ${preset.vibeQuery} `)).toBe(true);
  });

  it('is false once the vibe is edited', () => {
    expect(isPresetApplied(preset, applied, `${preset.vibeQuery}, with saxophone`)).toBe(false);
  });

  it.each<[string, Partial<RecommendationPreferences>]>([
    ['a genre is added', { genres: [...applied.genres, 'Jazz'] }],
    ['a genre is removed', { genres: [] }],
    ['a mood is swapped', { moods: ['Euphoric', 'Melancholic'] }],
    ['tempo changes', { tempo: applied.tempo + 1 }],
    ['energy changes', { energy: applied.energy - 1 }],
    ['density changes', { density: applied.density + 1 }],
    ['the era changes', { era: 'recent' }],
    ['a discovery setting changes', { stayFocused: !applied.stayFocused }],
  ])('is false once %s', (_change, change) => {
    expect(isPresetApplied(preset, { ...applied, ...change }, preset.vibeQuery)).toBe(false);
  });

  it('is false for the default controls', () => {
    expect(isPresetApplied(preset, DEFAULT_PREFERENCES, '')).toBe(false);
  });
});

describe('choosePresets', () => {
  it('draws the number asked for, with no preset twice', () => {
    const chosen = choosePresets(VIBE_PRESETS, PRESETS_SHOWN);

    expect(chosen).toHaveLength(PRESETS_SHOWN);
    expect(new Set(chosen).size).toBe(PRESETS_SHOWN);
    chosen.forEach((preset) => expect(VIBE_PRESETS).toContain(preset));
  });

  it('draws differently as the random numbers change', () => {
    const first = choosePresets(VIBE_PRESETS, PRESETS_SHOWN, () => 0);
    const last = choosePresets(VIBE_PRESETS, PRESETS_SHOWN, () => 0.999);

    expect(first).toEqual(VIBE_PRESETS.slice(0, PRESETS_SHOWN));
    expect(last).not.toEqual(first);
  });

  it('gives every preset when asked for more than there are', () => {
    const chosen = choosePresets(VIBE_PRESETS.slice(0, 3), 10);

    expect(chosen).toHaveLength(3);
  });

  it('leaves the presets it was given in their order', () => {
    const presets = [...VIBE_PRESETS];

    choosePresets(presets, PRESETS_SHOWN, () => 0.5);

    expect(presets).toEqual(VIBE_PRESETS);
  });
});
