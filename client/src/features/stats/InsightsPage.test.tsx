import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InsightsPage } from './InsightsPage';
import { HistoryEntry } from '../../types/history';

function makeEntry(
  artist: string,
  year: string,
  genres?: string[],
  country?: string,
  createdAt = '2025-01-15T10:00:00Z',
): HistoryEntry {
  return {
    id: crypto.randomUUID(),
    createdAt,
    recommendation: { artist, album: `${artist} Album`, year, reason: 'Reason.', genres, country },
    artworkResponse: { artworkUrl: null, year, appleMusicUrl: null },
  };
}

const sampleHistory: HistoryEntry[] = [
  makeEntry('Artist A', '1985', ['Post-Rock'], 'UK', '2025-01-10T00:00:00Z'),
  makeEntry('Artist B', '1993', ['Electronic'], 'USA', '2025-01-20T00:00:00Z'),
  makeEntry('Artist C', '2001', ['Post-Rock'], 'Germany', '2025-02-05T00:00:00Z'),
  makeEntry('Artist A', '2008', ['Ambient'], 'UK', '2025-02-15T00:00:00Z'),
  makeEntry('Artist D', '2015', ['Jazz'], 'France', '2025-03-01T00:00:00Z'),
];

describe('InsightsPage', () => {
  it('renders empty state when history is empty', () => {
    render(<InsightsPage history={[]} />);
    expect(screen.getByText(/Start discovering albums/)).toBeInTheDocument();
  });

  it('describes the listener’s taste at the top', () => {
    const history = Array.from({ length: 6 }, (_, i) =>
      makeEntry(`Artist ${i}`, '1981', ['Post-punk'], 'Germany'),
    );
    render(<InsightsPage history={history} />);

    const taste = screen.getByRole('region', { name: 'Your taste' });
    expect(taste).toHaveTextContent(
      'You lean towards Post-punk, mostly from the 1980s and Germany.',
    );
    expect(taste.compareDocumentPosition(screen.getByText('Albums discovered'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('asks the listener to keep going while there are too few albums to describe', () => {
    render(<InsightsPage history={sampleHistory.slice(0, 3)} />);

    expect(screen.getByText(/Keep going/)).toBeInTheDocument();
  });

  it('shows no taste section when the library is empty', () => {
    render(<InsightsPage history={[]} />);

    expect(screen.queryByRole('region', { name: 'Your taste' })).not.toBeInTheDocument();
  });

  it('renders summary stat cards', () => {
    render(<InsightsPage history={sampleHistory} />);
    expect(screen.getByText('Albums discovered')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Unique artists')).toBeInTheDocument();
    // "4" appears for both unique artists and countries — check both labels are present
    expect(screen.getAllByText('4').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the activity chart when multiple months of data exist', () => {
    render(<InsightsPage history={sampleHistory} />);
    expect(screen.getByText('Activity over time')).toBeInTheDocument();
  });

  it('does not render the activity chart for a single month', () => {
    const singleMonth = sampleHistory.map((e) => ({
      ...e,
      createdAt: '2025-01-10T00:00:00Z',
    }));
    render(<InsightsPage history={singleMonth} />);
    expect(screen.queryByText('Activity over time')).not.toBeInTheDocument();
  });

  it('renders decade breakdown', () => {
    render(<InsightsPage history={sampleHistory} />);
    expect(screen.getByText('By decade')).toBeInTheDocument();
    expect(screen.getByText('1980s')).toBeInTheDocument();
    expect(screen.getByText('1990s')).toBeInTheDocument();
  });

  it('renders genre and country breakdowns when data is present', () => {
    render(<InsightsPage history={sampleHistory} />);
    expect(screen.getByText('Top genres')).toBeInTheDocument();
    expect(screen.getByText('By country')).toBeInTheDocument();
  });

  it('renders top artists section', () => {
    render(<InsightsPage history={sampleHistory} />);
    expect(screen.getByText('Top artists')).toBeInTheDocument();
    expect(screen.getByText('Artist A')).toBeInTheDocument();
  });

  it('omits genre section when no genre data exists', () => {
    const noGenres = sampleHistory.map((e) => ({
      ...e,
      recommendation: { ...e.recommendation, genres: undefined },
    }));
    render(<InsightsPage history={noGenres} />);
    expect(screen.queryByText('Top genres')).not.toBeInTheDocument();
  });
});
