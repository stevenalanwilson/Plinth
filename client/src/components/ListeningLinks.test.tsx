import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListeningLinks } from './ListeningLinks';

describe('ListeningLinks', () => {
  it('links to Apple Music, Spotify and Discogs searches for the album', () => {
    render(<ListeningLinks artist="The Sound" album="Jeopardy" />);

    expect(screen.getByRole('link', { name: 'Apple Music' })).toHaveAttribute(
      'href',
      expect.stringContaining('music.apple.com'),
    );
    expect(screen.getByRole('link', { name: 'Spotify' })).toHaveAttribute(
      'href',
      expect.stringContaining('open.spotify.com'),
    );
    expect(screen.getByRole('link', { name: 'Discogs' })).toHaveAttribute(
      'href',
      expect.stringContaining('discogs.com'),
    );
    screen.getAllByRole('link').forEach((link) => {
      expect(link.getAttribute('href')).toContain('Jeopardy');
    });
  });

  it('opens each in a new tab without handing over the page', () => {
    render(<ListeningLinks artist="The Sound" album="Jeopardy" />);

    screen.getAllByRole('link').forEach((link) => {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('goes straight to the album in Apple Music when it knows where it is', () => {
    render(
      <ListeningLinks
        artist="The Sound"
        album="Jeopardy"
        appleMusicUrl="https://music.apple.com/gb/album/jeopardy/1"
      />,
    );

    expect(screen.getByRole('link', { name: 'Apple Music' })).toHaveAttribute(
      'href',
      'https://music.apple.com/gb/album/jeopardy/1',
    );
  });

  it.each([null, undefined, ''])('searches when the direct link is %j', (appleMusicUrl) => {
    render(<ListeningLinks artist="The Sound" album="Jeopardy" appleMusicUrl={appleMusicUrl} />);

    expect(screen.getByRole('link', { name: 'Apple Music' })).toHaveAttribute(
      'href',
      expect.stringContaining('search'),
    );
  });
});
