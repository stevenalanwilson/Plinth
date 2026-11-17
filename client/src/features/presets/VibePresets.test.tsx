import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '../../hooks/useRecommendation';
import { VibePresets } from './VibePresets';
import { VIBE_PRESETS } from './presets';

describe('VibePresets', () => {
  it('offers every preset as a button, none chosen to begin with', () => {
    render(<VibePresets preferences={DEFAULT_PREFERENCES} vibeQuery="" onSelect={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Start from a vibe' })).toBeInTheDocument();
    VIBE_PRESETS.forEach((preset) => {
      expect(screen.getByRole('button', { name: preset.label })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  it('hands over the tapped preset', () => {
    const onSelect = vi.fn();
    render(<VibePresets preferences={DEFAULT_PREFERENCES} vibeQuery="" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: VIBE_PRESETS[2].label }));

    expect(onSelect).toHaveBeenCalledWith(VIBE_PRESETS[2]);
  });

  it('marks the preset the controls currently hold', () => {
    const chosen = VIBE_PRESETS[0];
    render(
      <VibePresets
        preferences={chosen.preferences}
        vibeQuery={chosen.vibeQuery}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: chosen.label })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: VIBE_PRESETS[1].label })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
