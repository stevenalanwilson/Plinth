import React from 'react';
import { RecommendationPreferences } from '@shared/types';
import { isPresetApplied, VibePreset, VIBE_PRESETS } from './presets';

interface VibePresetsProps {
  readonly preferences: RecommendationPreferences;
  readonly vibeQuery: string;
  readonly onSelect: (preset: VibePreset) => void;
}

/** One-tap starting points that fill in the vibe and the controls; the pick is still a tap away. */
export function VibePresets({
  preferences,
  vibeQuery,
  onSelect,
}: VibePresetsProps): React.ReactElement {
  return (
    <section className="vibe-presets" aria-labelledby="vibe-presets-heading">
      <h2 id="vibe-presets-heading" className="vibe-presets-heading">
        Start from a vibe
      </h2>
      <div className="vibe-presets-list">
        {VIBE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="vibe-preset"
            aria-pressed={isPresetApplied(preset, preferences, vibeQuery)}
            onClick={() => onSelect(preset)}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </section>
  );
}
