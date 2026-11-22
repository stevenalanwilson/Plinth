import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '../../hooks/useRecommendation';
import { VibePresets } from './VibePresets';
import { VIBE_PRESETS } from './presets';

const SHOWN = VIBE_PRESETS.slice(0, 3);

describe('VibePresets', () => {
  it('offers the presets it is given as buttons, none chosen to begin with', () => {
    render(
      <VibePresets
        presets={SHOWN}
        preferences={DEFAULT_PREFERENCES}
        vibeQuery=""
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Start from a vibe' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(SHOWN.length);
    SHOWN.forEach((preset) => {
      expect(screen.getByRole('button', { name: preset.label })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  it('hands over the tapped preset', () => {
    const onSelect = vi.fn();
    render(
      <VibePresets
        presets={SHOWN}
        preferences={DEFAULT_PREFERENCES}
        vibeQuery=""
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: SHOWN[2].label }));

    expect(onSelect).toHaveBeenCalledWith(SHOWN[2]);
  });

  it('marks the preset the controls currently hold', () => {
    const chosen = SHOWN[0];
    render(
      <VibePresets
        presets={SHOWN}
        preferences={chosen.preferences}
        vibeQuery={chosen.vibeQuery}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: chosen.label })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: SHOWN[1].label })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
