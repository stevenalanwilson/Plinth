import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HistoryEntry } from '../../types/history';
import { TasteSummary } from './TasteSummary';

function entries(count: number): HistoryEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `album-${i}`,
    createdAt: '2026-11-01T10:00:00.000Z',
    recommendation: {
      artist: `Artist ${i}`,
      album: `Album ${i}`,
      year: '1981',
      reason: 'Good.',
      genres: ['Post-punk'],
      country: 'United Kingdom',
    },
    artworkResponse: { artworkUrl: null, year: '1981', appleMusicUrl: null },
  }));
}

describe('TasteSummary', () => {
  it('describes the listener’s taste once there is enough to say', () => {
    render(<TasteSummary history={entries(6)} />);

    expect(screen.getByRole('region', { name: 'Your taste' })).toBeInTheDocument();
    expect(
      screen.getByText('You lean towards Post-punk, mostly from the 1980s and the United Kingdom.'),
    ).toBeInTheDocument();
  });

  it('says how many albums it is based on, and what counts most', () => {
    render(<TasteSummary history={entries(6)} />);

    expect(
      screen.getByText('Worked out from 6 albums. The ones you own or want count most.'),
    ).toBeInTheDocument();
  });

  it('asks the listener to keep going while there is too little to describe', () => {
    render(<TasteSummary history={entries(3)} />);

    expect(screen.getByText(/Keep going/)).toBeInTheDocument();
    expect(screen.queryByText(/You lean towards/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Worked out from/)).not.toBeInTheDocument();
  });
});
