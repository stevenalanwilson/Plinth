import React from 'react';
import { RecommendationPreferences, Era } from '@shared/types';

const GENRE_OPTIONS = [
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

const MOOD_OPTIONS = [
  'Late night',
  'High energy',
  'Chill',
  'Focus',
  'Melancholic',
  'Euphoric',
  'Hopeful',
] as const;

const ERA_OPTIONS: { value: Era; label: string }[] = [
  { value: 'pre-80s', label: 'Pre-80s' },
  { value: '80s-90s', label: '80s–90s' },
  { value: '00s-10s', label: '00s–10s' },
  { value: 'recent', label: 'Recent' },
  { value: 'any', label: 'Any' },
];

const sectionLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--muted)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 8,
};

const pillBaseStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '5px 12px',
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

  function handleSliderChange(field: 'tempo' | 'energy' | 'density', value: number): void {
    onChange({ ...preferences, [field]: value });
  }

  function handleEraChange(era: Era): void {
    onChange({ ...preferences, era });
  }

  function handleToggleChange(
    field: 'includeFamiliarArtists' | 'prioritiseObscure' | 'stayFocused',
  ): void {
    onChange({ ...preferences, [field]: !preferences[field] });
  }

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Genres */}
      <div style={{ marginBottom: 20 }}>
        <label style={sectionLabelStyle}>Genres</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {GENRE_OPTIONS.map((genre) => {
            const isSelected = preferences.genres.includes(genre);
            return (
              <button
                key={genre}
                type="button"
                onClick={() => handleGenreToggle(genre)}
                aria-pressed={isSelected}
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
      <div style={{ marginBottom: 20 }}>
        <label style={sectionLabelStyle}>Mood</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {MOOD_OPTIONS.map((mood) => {
            const isSelected = preferences.moods.includes(mood);
            return (
              <button
                key={mood}
                type="button"
                onClick={() => handleMoodToggle(mood)}
                aria-pressed={isSelected}
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
      <div style={{ marginBottom: 20 }}>
        <label style={sectionLabelStyle}>Feel</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(
            [
              { field: 'tempo', minLabel: 'Slow', maxLabel: 'Fast' },
              { field: 'energy', minLabel: 'Mellow', maxLabel: 'Intense' },
              { field: 'density', minLabel: 'Sparse', maxLabel: 'Dense' },
            ] as const
          ).map(({ field, minLabel, maxLabel }) => (
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
                <span style={{ textTransform: 'capitalize' }}>{field}</span>
                <span>{maxLabel}</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
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
      <div style={{ marginBottom: 20 }}>
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
                onClick={() => handleEraChange(value)}
                aria-pressed={isSelected}
                style={{
                  flex: 1,
                  padding: '6px 4px',
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
      <div>
        <label style={sectionLabelStyle}>Discovery</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(
            [
              { field: 'includeFamiliarArtists', label: 'Include familiar artists' },
              { field: 'prioritiseObscure', label: 'Prioritise obscure picks' },
              { field: 'stayFocused', label: 'Stay focused' },
            ] as const
          ).map(({ field, label }) => (
            <label
              key={field}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13,
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
