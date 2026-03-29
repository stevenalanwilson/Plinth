import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryGrid } from './HistoryGrid';
import { HistoryEntry } from '../../types/history';

const entries: HistoryEntry[] = [
  {
    id: 'test-id-1',
    recommendation: { artist: 'Burial', album: 'Untrue', year: '2007', reason: 'Great album.' },
    artworkResponse: { artworkUrl: null, year: '2007', appleMusicUrl: null, spotifyUrl: null },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'test-id-2',
    recommendation: {
      artist: 'Four Tet',
      album: 'There Is Love In You',
      year: '2010',
      reason: 'Lovely.',
    },
    artworkResponse: {
      artworkUrl: 'https://example.com/art.jpg',
      year: '2010',
      appleMusicUrl: 'https://music.apple.com/gb/album/there-is-love-in-you/12345',
      spotifyUrl: null,
    },
    createdAt: new Date().toISOString(),
  },
];

// Build 10 entries to test the show-more behaviour
const manyEntries: HistoryEntry[] = Array.from({ length: 10 }, (_, i) => ({
  id: `id-${i}`,
  recommendation: { artist: `Artist ${i}`, album: `Album ${i}`, year: '2020', reason: 'Good.' },
  artworkResponse: { artworkUrl: null, year: '2020', appleMusicUrl: null, spotifyUrl: null },
  createdAt: new Date().toISOString(),
}));

describe('HistoryGrid', () => {
  it('renders all history entries', () => {
    render(<HistoryGrid history={entries} onClear={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Untrue')).toBeInTheDocument();
    expect(screen.getByText('There Is Love In You')).toBeInTheDocument();
  });

  it('renders artist names', () => {
    render(<HistoryGrid history={entries} onClear={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Burial')).toBeInTheDocument();
    expect(screen.getByText('Four Tet')).toBeInTheDocument();
  });

  it('renders artwork when artworkUrl is provided', () => {
    render(<HistoryGrid history={entries} onClear={vi.fn()} onRemove={vi.fn()} />);
    const img = screen.getByAltText('There Is Love In You') as HTMLImageElement;
    expect(img).toBeInTheDocument();
  });

  it('links directly to appleMusicUrl when available', () => {
    render(<HistoryGrid history={entries} onClear={vi.fn()} onRemove={vi.fn()} />);
    const links = screen.getAllByRole('link');
    const fourTetLink = links.find(
      (l) =>
        l.getAttribute('href') === 'https://music.apple.com/gb/album/there-is-love-in-you/12345',
    );
    expect(fourTetLink).toBeDefined();
    expect(fourTetLink).toHaveAttribute('target', '_blank');
  });

  it('falls back to Apple Music search URL when appleMusicUrl is null', () => {
    render(<HistoryGrid history={entries} onClear={vi.fn()} onRemove={vi.fn()} />);
    const links = screen.getAllByRole('link');
    const burialLink = links.find((l) =>
      l.getAttribute('href')?.includes('music.apple.com/gb/search'),
    );
    expect(burialLink).toBeDefined();
    expect(burialLink?.getAttribute('href')).toContain('Burial');
  });

  it('renders Spotify search links for every item', () => {
    render(<HistoryGrid history={entries} onClear={vi.fn()} onRemove={vi.fn()} />);
    const spotifyLinks = screen
      .getAllByRole('link')
      .filter((l) => l.getAttribute('href')?.includes('open.spotify.com'));
    expect(spotifyLinks).toHaveLength(entries.length);
  });

  it('renders Apple Music and Spotify links in the overlay for every item', () => {
    render(<HistoryGrid history={entries} onClear={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getAllByText('Apple Music')).toHaveLength(entries.length);
    expect(screen.getAllByText('Search in Spotify')).toHaveLength(entries.length);
  });

  it('calls onClear when the clear button is clicked', async () => {
    const onClear = vi.fn();
    render(<HistoryGrid history={entries} onClear={onClear} onRemove={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('calls onRemove with the correct id when remove is clicked', async () => {
    const onRemove = vi.fn();
    render(<HistoryGrid history={entries} onClear={vi.fn()} onRemove={onRemove} />);
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    await userEvent.click(removeButtons[0]);
    expect(onRemove).toHaveBeenCalledWith('test-id-1');
  });

  it('shows only 9 items when history exceeds the visible count', () => {
    render(<HistoryGrid history={manyEntries} onClear={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Album 0')).toBeInTheDocument();
    expect(screen.queryByText('Album 9')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show 1 more/i })).toBeInTheDocument();
  });

  it('expands to show all items when "Show more" is clicked', async () => {
    render(<HistoryGrid history={manyEntries} onClear={vi.fn()} onRemove={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /show 1 more/i }));
    expect(screen.getByText('Album 9')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();
  });

  it('collapses back when "Show less" is clicked', async () => {
    render(<HistoryGrid history={manyEntries} onClear={vi.fn()} onRemove={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /show 1 more/i }));
    await userEvent.click(screen.getByRole('button', { name: /show less/i }));
    expect(screen.queryByText('Album 9')).not.toBeInTheDocument();
  });
});
