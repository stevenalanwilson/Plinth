import React from 'react';
import { RecommendationPreferences, Era, SLIDER_MIN, SLIDER_MAX, ERA_VALUES } from '@shared/types';
import { GENRE_OPTIONS, MOOD_OPTIONS } from './preferenceOptions';

// Derived from the interface so field names stay in sync automatically with any future renames.
type SliderField = {
  [K in keyof RecommendationPreferences]: RecommendationPreferences[K] extends number ? K : never;
}[keyof RecommendationPreferences];

type ToggleField = {
  [K in keyof RecommendationPreferences]: RecommendationPreferences[K] extends boolean ? K : never;
}[keyof RecommendationPreferences];

// Record keyed on Era enforces exhaustiveness: TypeScript errors if a new era is added
// to ERA_VALUES without a corresponding label here.
const ERA_LABELS: Record<Era, string> = {
  'pre-80s': 'Pre-80s',
  '80s-90s': '80s–90s',
  '00s-10s': '00s–10s',
  recent: 'Recent',
  any: 'Any',
};

const ERA_OPTIONS = ERA_VALUES.map((value) => ({ value, label: ERA_LABELS[value] }));

export const sectionLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--muted)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 6,
};

const pillBaseStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '6px 12px',
  borderRadius: 20,
  fontSize: 12,
  fontFamily: 'var(--mono)',
  cursor: 'pointer',
  border: '1px solid var(--border)',
  userSelect: 'none',
};

interface PreferencesPanelProps {
  preferences: RecommendationPreferences;
  onChange: (prefs: RecommendationPreferences) => void;
}

function toggleArrayItem(arr: readonly string[], item: string): string[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export function PreferencesPanel({
  preferences,
  onChange,
}: PreferencesPanelProps): React.ReactElement {
  function handleGenreToggle(genre: string): void {
    onChange({ ...preferences, genres: toggleArrayItem(preferences.genres, genre) });
  }

  function handleMoodToggle(mood: string): void {
    onChange({ ...preferences, moods: toggleArrayItem(preferences.moods, mood) });
  }

  function handleSliderChange(field: SliderField, value: number): void {
    onChange({ ...preferences, [field]: value });
  }

  function handleEraChange(era: Era): void {
    onChange({ ...preferences, era });
  }

  function handleToggleChange(field: ToggleField): void {
    onChange({ ...preferences, [field]: !preferences[field] });
  }

  const sectionStyle: React.CSSProperties = {
    marginBottom: 20,
  };

  const sectionWithDividerStyle: React.CSSProperties = {
    ...sectionStyle,
    borderTop: '1px solid var(--border)',
    paddingTop: 20,
  };

  return (
    <div style={{ marginBottom: 0 }}>
      {/* Genres */}
      <div style={sectionStyle}>
        <label style={sectionLabelStyle}>Genres</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {GENRE_OPTIONS.map((genre) => {
            const isSelected = preferences.genres.includes(genre);
            return (
              <button
                key={genre}
                type="button"
                onClick={() => handleGenreToggle(genre)}
                className="pill-button"
                aria-pressed={isSelected}
                aria-label={`${genre} genre`}
                style={{
                  ...pillBaseStyle,
                  background: isSelected ? 'var(--accent)' : 'var(--surface2)',
                  color: isSelected ? '#0e0e0f' : 'var(--text)',
                  borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                }}
              >
                {genre}
              </button>
            );
          })}
        </div>
      </div>

      {/* Moods */}
      <div style={sectionWithDividerStyle}>
        <label style={sectionLabelStyle}>Mood</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {MOOD_OPTIONS.map((mood) => {
            const isSelected = preferences.moods.includes(mood);
            return (
              <button
                key={mood}
                type="button"
                onClick={() => handleMoodToggle(mood)}
                className="pill-button"
                aria-pressed={isSelected}
                aria-label={`${mood} mood`}
                style={{
                  ...pillBaseStyle,
                  background: isSelected ? 'var(--accent)' : 'var(--surface2)',
                  color: isSelected ? '#0e0e0f' : 'var(--text)',
                  borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                }}
              >
                {mood}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sliders */}
      <div style={sectionWithDividerStyle}>
        <label style={sectionLabelStyle}>Feel</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(
            [
              {
                field: 'tempo',
                minLabel: 'Slow',
                maxLabel: 'Fast',
                description: 'Pace of the music',
              },
              {
                field: 'energy',
                minLabel: 'Mellow',
                maxLabel: 'Intense',
                description: 'Intensity and drive',
              },
              {
                field: 'density',
                minLabel: 'Sparse',
                maxLabel: 'Dense',
                description: 'Layering and arrangement',
              },
            ] as const
          ).map(({ field, minLabel, maxLabel, description }) => (
            <div key={field}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  color: 'var(--muted)',
                  fontFamily: 'var(--mono)',
                  marginBottom: 4,
                }}
              >
                <span>{minLabel}</span>
                <span style={{ textAlign: 'center' }}>
                  <span style={{ textTransform: 'capitalize', display: 'block' }}>{field}</span>
                  <span style={{ fontSize: 10, fontStyle: 'italic' }}>{description}</span>
                </span>
                <span>{maxLabel}</span>
              </div>
              <input
                type="range"
                min={SLIDER_MIN}
                max={SLIDER_MAX}
                value={preferences[field]}
                onChange={(e) => handleSliderChange(field, Number(e.target.value))}
                aria-label={field}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Era */}
      <div style={sectionWithDividerStyle}>
        <label style={sectionLabelStyle}>Era</label>
        <div
          style={{
            display: 'flex',
            gap: 4,
            background: 'var(--surface2)',
            borderRadius: 8,
            padding: 4,
            border: '1px solid var(--border)',
          }}
        >
          {ERA_OPTIONS.map(({ value, label }) => {
            const isSelected = preferences.era === value;
            return (
              <button
                key={value}
                type="button"
                className="era-button"
                onClick={() => handleEraChange(value)}
                aria-pressed={isSelected}
                style={{
                  flex: 1,
                  padding: '7px 4px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontFamily: 'var(--mono)',
                  cursor: 'pointer',
                  border: 'none',
                  background: isSelected ? 'var(--accent)' : 'transparent',
                  color: isSelected ? '#0e0e0f' : 'var(--muted)',
                  fontWeight: isSelected ? 600 : 400,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Discovery toggles */}
      <div style={sectionWithDividerStyle}>
        <label style={sectionLabelStyle}>Discovery</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(
            [
              { field: 'includeFamiliarArtists', label: 'Allow well-known artists' },
              { field: 'prioritiseObscure', label: 'Underground & lesser-known only' },
              { field: 'stayFocused', label: 'Stick strictly to my preferences' },
            ] as const
          ).map(({ field, label }) => (
            <label
              key={field}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 36,
                fontSize: 12,
                fontFamily: 'var(--mono)',
                cursor: 'pointer',
                color: 'var(--text)',
              }}
            >
              <input
                type="checkbox"
                checked={preferences[field]}
                onChange={() => handleToggleChange(field)}
                style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
