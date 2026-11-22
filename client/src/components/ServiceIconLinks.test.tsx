import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceIconLinks } from './ServiceIconLinks';

describe('ServiceIconLinks', () => {
  it('names each icon link, for screen readers and as a tooltip', () => {
    render(<ServiceIconLinks artist="The Sound" album="Jeopardy" appleMusicUrl={null} />);

    ['Search in Apple Music', 'Search in Spotify', 'Search in Discogs'].forEach((label) => {
      const link = screen.getByRole('link', { name: label });
      expect(link).toHaveAttribute('title', label);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('searches each service for the album', () => {
    render(<ServiceIconLinks artist="The Sound" album="Jeopardy" appleMusicUrl={null} />);

    expect(screen.getByRole('link', { name: 'Search in Apple Music' })).toHaveAttribute(
      'href',
      expect.stringContaining('music.apple.com/gb/search'),
    );
    expect(screen.getByRole('link', { name: 'Search in Spotify' })).toHaveAttribute(
      'href',
      expect.stringContaining('open.spotify.com/search'),
    );
    expect(screen.getByRole('link', { name: 'Search in Discogs' })).toHaveAttribute(
      'href',
      expect.stringContaining('discogs.com/search'),
    );
  });

  it('goes straight to the album in Apple Music when it can, and picks that link out', () => {
    const direct = 'https://music.apple.com/gb/album/jeopardy/1';
    render(<ServiceIconLinks artist="The Sound" album="Jeopardy" appleMusicUrl={direct} />);

    const link = screen.getByRole('link', { name: 'Open in Apple Music' });
    expect(link).toHaveAttribute('href', direct);
    expect(link).toHaveAttribute('data-direct', 'true');
    expect(screen.getByRole('link', { name: 'Search in Spotify' })).toHaveAttribute(
      'data-direct',
      'false',
    );
  });
});
