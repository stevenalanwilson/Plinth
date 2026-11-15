import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlaceholderSleeve, sleeveHue } from './PlaceholderSleeve';

describe('PlaceholderSleeve', () => {
  it('shows the album and artist', () => {
    render(<PlaceholderSleeve artist="The Sound" album="Jeopardy" />);

    expect(screen.getByText('Jeopardy')).toBeInTheDocument();
    expect(screen.getByText('The Sound')).toBeInTheDocument();
  });

  it('describes itself as missing artwork', () => {
    render(<PlaceholderSleeve artist="The Sound" album="Jeopardy" compact />);

    expect(
      screen.getByRole('img', { name: 'Jeopardy by The Sound, no artwork available' }),
    ).toBeInTheDocument();
  });
});

describe('sleeveHue', () => {
  it('gives the same album the same hue every time', () => {
    expect(sleeveHue('The Sound – Jeopardy')).toBe(sleeveHue('The Sound – Jeopardy'));
  });

  it('gives different albums different hues', () => {
    expect(sleeveHue('The Sound – Jeopardy')).not.toBe(
      sleeveHue('The Sound – From the Lion’s Mouth'),
    );
  });

  it('stays within the colour wheel', () => {
    expect(sleeveHue('a'.repeat(500))).toBeGreaterThanOrEqual(0);
    expect(sleeveHue('a'.repeat(500))).toBeLessThan(360);
  });
});
