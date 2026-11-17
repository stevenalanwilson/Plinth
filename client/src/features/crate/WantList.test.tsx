import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { HistoryEntry } from '../../types/history';
import { WantList } from './WantList';

function entry(
  album: string,
  at: string,
  artwork: { artworkUrl?: string | null; appleMusicUrl?: string | null } = {},
): HistoryEntry {
  return {
    id: album,
    createdAt: '2026-11-01T10:00:00.000Z',
    recommendation: { artist: 'The Sound', album, year: '1980', reason: 'Good.' },
    artworkResponse: {
      artworkUrl: artwork.artworkUrl ?? null,
      year: '1980',
      appleMusicUrl: artwork.appleMusicUrl ?? null,
    },
    feedback: { status: 'want-vinyl', at },
  };
}

const LIST = [
  entry('Jeopardy', '2026-11-02T10:00:00.000Z', {
    artworkUrl: 'https://coverartarchive.org/release/x/1-500.jpg',
    appleMusicUrl: 'https://music.apple.com/gb/album/jeopardy/1',
  }),
  entry('From the Lion’s Mouth', '2026-11-05T10:00:00.000Z'),
];

function rows(): HTMLElement[] {
  return screen.getAllByRole('listitem');
}

describe('WantList', () => {
  it('lists the albums newest first by when they were added', () => {
    render(<WantList entries={LIST} onSelect={vi.fn()} onGotIt={vi.fn()} />);

    expect(
      rows().map((row) => within(row).getByRole('button', { name: /^Load / }).textContent),
    ).toEqual(['From the Lion’s Mouth', 'Jeopardy']);
  });

  it('shows each album’s artist and year', () => {
    render(<WantList entries={[LIST[0]]} onSelect={vi.fn()} onGotIt={vi.fn()} />);

    expect(screen.getByText('The Sound · 1980')).toBeInTheDocument();
  });

  it('offers Apple Music, Spotify and Discogs for each album', () => {
    render(<WantList entries={LIST} onSelect={vi.fn()} onGotIt={vi.fn()} />);

    rows().forEach((row) => {
      expect(
        within(row)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(['Apple Music', 'Spotify', 'Discogs']);
    });
  });

  it('goes straight to Apple Music when the album’s link is known, and searches otherwise', () => {
    render(<WantList entries={LIST} onSelect={vi.fn()} onGotIt={vi.fn()} />);

    const [searched, direct] = rows().map((row) =>
      within(row).getByRole('link', { name: 'Apple Music' }).getAttribute('href'),
    );
    expect(direct).toBe('https://music.apple.com/gb/album/jeopardy/1');
    expect(searched).toContain('search');
  });

  it('shows the cover through the image proxy, or a placeholder sleeve without one', () => {
    render(<WantList entries={LIST} onSelect={vi.fn()} onGotIt={vi.fn()} />);

    expect(screen.getByAltText('Jeopardy album artwork')).toHaveAttribute(
      'src',
      expect.stringContaining(
        encodeURIComponent('https://coverartarchive.org/release/x/1-500.jpg'),
      ),
    );
    expect(
      screen.getByRole('img', { name: /From the Lion’s Mouth by The Sound, no artwork available/ }),
    ).toBeInTheDocument();
  });

  it('falls back to the placeholder sleeve when a cover fails to load', () => {
    render(<WantList entries={[LIST[0]]} onSelect={vi.fn()} onGotIt={vi.fn()} />);

    fireEvent.error(screen.getByAltText('Jeopardy album artwork'));

    expect(screen.queryByAltText('Jeopardy album artwork')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /no artwork available/ })).toBeInTheDocument();
  });

  it('brings the album back as the pick when its title is tapped', () => {
    const onSelect = vi.fn();
    render(<WantList entries={LIST} onSelect={onSelect} onGotIt={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Jeopardy by The Sound' }));

    expect(onSelect).toHaveBeenCalledWith('Jeopardy');
  });

  it('does not change what it is given', () => {
    const copy = [...LIST];

    render(<WantList entries={LIST} onSelect={vi.fn()} onGotIt={vi.fn()} />);

    expect(LIST).toEqual(copy);
  });

  it('has a Got it button for each album, named for the album', () => {
    render(<WantList entries={LIST} onSelect={vi.fn()} onGotIt={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: /^Mark .* as owned$/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Mark Jeopardy as owned' })).toHaveTextContent(
      'Got it',
    );
  });

  it('hands over the album that was bought', () => {
    const onGotIt = vi.fn();
    render(<WantList entries={LIST} onSelect={vi.fn()} onGotIt={onGotIt} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mark Jeopardy as owned' }));

    expect(onGotIt).toHaveBeenCalledWith('Jeopardy');
  });

  it('does not open the album when Got it is tapped', () => {
    const onSelect = vi.fn();
    render(<WantList entries={LIST} onSelect={onSelect} onGotIt={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mark Jeopardy as owned' }));

    expect(onSelect).not.toHaveBeenCalled();
  });
});
