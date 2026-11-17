import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryGrid } from './HistoryGrid';
import { HistoryEntry } from '../../types/history';

// Placeholder sleeves repeat the album and artist, so text queries skip them.
const NOT_IN_SLEEVE = { ignore: '[role="img"] *, script, style' };

const entries: HistoryEntry[] = [
  {
    id: 'test-id-1',
    recommendation: { artist: 'Burial', album: 'Untrue', year: '2007', reason: 'Great album.' },
    artworkResponse: { artworkUrl: null, year: '2007', appleMusicUrl: null },
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
    },
    createdAt: new Date().toISOString(),
  },
];

// Build 10 entries to test the show-more behaviour
const manyEntries: HistoryEntry[] = Array.from({ length: 10 }, (_, i) => ({
  id: `id-${i}`,
  recommendation: { artist: `Artist ${i}`, album: `Album ${i}`, year: '2020', reason: 'Good.' },
  artworkResponse: { artworkUrl: null, year: '2020', appleMusicUrl: null },
  createdAt: new Date().toISOString(),
}));

describe('HistoryGrid', () => {
  it('renders all history entries', () => {
    render(<HistoryGrid history={entries} onRemove={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText('Untrue', NOT_IN_SLEEVE)).toBeInTheDocument();
    expect(screen.getByText('There Is Love In You', NOT_IN_SLEEVE)).toBeInTheDocument();
  });

  it('renders artist names', () => {
    render(<HistoryGrid history={entries} onRemove={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText('Burial', NOT_IN_SLEEVE)).toBeInTheDocument();
    expect(screen.getByText('Four Tet', NOT_IN_SLEEVE)).toBeInTheDocument();
  });

  it('renders artwork when artworkUrl is provided', () => {
    render(<HistoryGrid history={entries} onRemove={vi.fn()} onSelect={vi.fn()} />);
    const img = screen.getByAltText('There Is Love In You') as HTMLImageElement;
    expect(img).toBeInTheDocument();
  });

  it('shows a placeholder sleeve for entries without artwork', () => {
    render(<HistoryGrid history={entries} onRemove={vi.fn()} onSelect={vi.fn()} />);
    expect(
      screen.getByRole('img', { name: 'Untrue by Burial, no artwork available' }),
    ).toBeInTheDocument();
  });

  it('links directly to appleMusicUrl when available', () => {
    render(<HistoryGrid history={entries} onRemove={vi.fn()} onSelect={vi.fn()} />);
    const links = screen.getAllByRole('link');
    const fourTetLink = links.find(
      (l) =>
        l.getAttribute('href') === 'https://music.apple.com/gb/album/there-is-love-in-you/12345',
    );
    expect(fourTetLink).toBeDefined();
    expect(fourTetLink).toHaveAttribute('target', '_blank');
  });

  it('falls back to Apple Music search URL when appleMusicUrl is null', () => {
    render(<HistoryGrid history={entries} onRemove={vi.fn()} onSelect={vi.fn()} />);
    const links = screen.getAllByRole('link');
    const burialLink = links.find((l) =>
      l.getAttribute('href')?.includes('music.apple.com/gb/search'),
    );
    expect(burialLink).toBeDefined();
    expect(burialLink?.getAttribute('href')).toContain('Burial');
  });

  it('renders Spotify search links for every item', () => {
    render(<HistoryGrid history={entries} onRemove={vi.fn()} onSelect={vi.fn()} />);
    const spotifyLinks = screen
      .getAllByRole('link')
      .filter((l) => l.getAttribute('href')?.includes('open.spotify.com'));
    expect(spotifyLinks).toHaveLength(entries.length);
  });

  it('renders Discogs search links for every item', () => {
    render(<HistoryGrid history={entries} onRemove={vi.fn()} onSelect={vi.fn()} />);
    const discogsLinks = screen
      .getAllByRole('link')
      .filter((l) => l.getAttribute('href')?.includes('discogs.com'));
    expect(discogsLinks).toHaveLength(entries.length);
  });

  it('renders Apple Music, Spotify, and Discogs links in the overlay for every item', () => {
    render(<HistoryGrid history={entries} onRemove={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getAllByText('Apple Music')).toHaveLength(entries.length);
    expect(screen.getAllByText('Spotify')).toHaveLength(entries.length);
    expect(screen.getAllByText('Discogs')).toHaveLength(entries.length);
  });

  it('calls onRemove with the correct id when remove is clicked', async () => {
    const onRemove = vi.fn();
    render(<HistoryGrid history={entries} onRemove={onRemove} onSelect={vi.fn()} />);
    // Hover the card first so the overlay becomes interactive
    const card = screen.getByRole('button', { name: /Load Untrue by Burial/i });
    await userEvent.hover(card);
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    await userEvent.click(removeButtons[0]);
    expect(onRemove).toHaveBeenCalledWith('test-id-1');
  });

  it('calls onSelect with the correct id when a card is clicked', async () => {
    const onSelect = vi.fn();
    render(<HistoryGrid history={entries} onRemove={vi.fn()} onSelect={onSelect} />);
    const card = screen.getByRole('button', { name: /Load Untrue by Burial/i });
    await userEvent.click(card);
    expect(onSelect).toHaveBeenCalledWith('test-id-1');
  });

  it('does not call onSelect when Remove is clicked inside a card', async () => {
    const onSelect = vi.fn();
    render(<HistoryGrid history={entries} onRemove={vi.fn()} onSelect={onSelect} />);
    // Hover to make the overlay interactive before clicking Remove
    const card = screen.getByRole('button', { name: /Load Untrue by Burial/i });
    await userEvent.hover(card);
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    await userEvent.click(removeButtons[0]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows only 9 items when history exceeds the visible count', () => {
    render(<HistoryGrid history={manyEntries} onRemove={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText('Album 0', NOT_IN_SLEEVE)).toBeInTheDocument();
    expect(screen.queryByText('Album 9')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show 1 more/i })).toBeInTheDocument();
  });

  it('expands to show all items when "Show more" is clicked', async () => {
    render(<HistoryGrid history={manyEntries} onRemove={vi.fn()} onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /show 1 more/i }));
    expect(screen.getByText('Album 9', NOT_IN_SLEEVE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();
  });

  it('collapses back when "Show less" is clicked', async () => {
    render(<HistoryGrid history={manyEntries} onRemove={vi.fn()} onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /show 1 more/i }));
    await userEvent.click(screen.getByRole('button', { name: /show less/i }));
    expect(screen.queryByText('Album 9')).not.toBeInTheDocument();
  });

  describe('verdict badges', () => {
    const rated = (status: 'own' | 'not-for-me' | null): HistoryEntry[] => [
      { ...entries[0], feedback: { status, at: new Date().toISOString() } },
    ];

    it('labels an album that has a verdict', () => {
      render(<HistoryGrid history={rated('own')} onRemove={vi.fn()} onSelect={vi.fn()} />);

      expect(screen.getByText('Own it')).toHaveAttribute('data-status', 'own');
    });

    it('says the verdict in the card’s name, for screen readers', () => {
      render(<HistoryGrid history={rated('not-for-me')} onRemove={vi.fn()} onSelect={vi.fn()} />);

      expect(
        screen.getByRole('button', { name: 'Load Untrue by Burial, marked Not for me' }),
      ).toBeInTheDocument();
    });

    it('shows no badge for an album with no verdict, or one that was cleared', () => {
      render(
        <HistoryGrid
          history={[entries[1], ...rated(null)]}
          onRemove={vi.fn()}
          onSelect={vi.fn()}
        />,
      );

      expect(document.querySelector('.feedback-badge')).toBeNull();
      expect(screen.getByRole('button', { name: 'Load Untrue by Burial' })).toBeInTheDocument();
    });
  });

  describe('removing an album', () => {
    // The overlay's buttons are only reachable while hovered, so these use fireEvent.
    it('removes an unrated album on the first tap', () => {
      const onRemove = vi.fn();
      render(<HistoryGrid history={[entries[0]]} onRemove={onRemove} onSelect={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

      expect(onRemove).toHaveBeenCalledWith('test-id-1');
    });

    it('asks before removing an album the listener rated', () => {
      const onRemove = vi.fn();
      const rated: HistoryEntry = {
        ...entries[0],
        feedback: { status: 'own', at: new Date().toISOString() },
      };
      render(<HistoryGrid history={[rated]} onRemove={onRemove} onSelect={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
      expect(onRemove).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Tap again to remove' }));
      expect(onRemove).toHaveBeenCalledWith('test-id-1');
    });

    it('removes an album whose rating was cleared on the first tap', () => {
      const onRemove = vi.fn();
      const cleared: HistoryEntry = {
        ...entries[0],
        feedback: { status: null, at: new Date().toISOString() },
      };
      render(<HistoryGrid history={[cleared]} onRemove={onRemove} onSelect={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

      expect(onRemove).toHaveBeenCalledWith('test-id-1');
    });
  });
});
