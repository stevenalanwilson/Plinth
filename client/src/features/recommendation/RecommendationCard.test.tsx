import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecommendationCard } from './RecommendationCard';

const mockRec = {
  artist: 'Massive Attack',
  album: 'Mezzanine',
  year: '1998',
  reason: 'A perfect album for your taste.',
};

const mockArtwork = { artworkUrl: null, year: '1998', appleMusicUrl: null, spotifyUrl: null };
const mockArtworkWithLink = {
  artworkUrl: null,
  year: '1998',
  appleMusicUrl: 'https://music.apple.com/gb/album/mezzanine/123456',
  spotifyUrl: null,
};

describe('RecommendationCard', () => {
  it('renders the empty state when no recommendation', () => {
    render(
      <RecommendationCard
        recommendation={null}
        artworkResponse={null}
        isLoading={false}
        error={null}
      />,
    );
    expect(screen.getByText(/next favourite album is waiting/)).toBeInTheDocument();
  });

  it('renders the loading state', () => {
    render(
      <RecommendationCard
        recommendation={null}
        artworkResponse={null}
        isLoading={true}
        error={null}
      />,
    );
    expect(screen.getByText(/Finding your next favourite/)).toBeInTheDocument();
  });

  it('renders an error message', () => {
    render(
      <RecommendationCard
        recommendation={null}
        artworkResponse={null}
        isLoading={false}
        error="API error"
      />,
    );
    expect(screen.getByText('API error')).toBeInTheDocument();
  });

  it('renders a recommendation card', () => {
    render(
      <RecommendationCard
        recommendation={mockRec}
        artworkResponse={mockArtwork}
        isLoading={false}
        error={null}
      />,
    );
    expect(screen.getByText('Mezzanine')).toBeInTheDocument();
    expect(screen.getByText('Massive Attack')).toBeInTheDocument();
    expect(screen.getByText('1998')).toBeInTheDocument();
    expect(screen.getByText('A perfect album for your taste.')).toBeInTheDocument();
  });

  it('renders the Apple Music search link when no direct URL is available', () => {
    render(
      <RecommendationCard
        recommendation={mockRec}
        artworkResponse={mockArtwork}
        isLoading={false}
        error={null}
      />,
    );
    const link = screen.getByText('Search in Apple Music').closest('a');
    expect(link).toHaveAttribute('href', expect.stringContaining('music.apple.com/gb/search'));
  });

  it('renders "Open in Apple Music" with the direct URL when available', () => {
    render(
      <RecommendationCard
        recommendation={mockRec}
        artworkResponse={mockArtworkWithLink}
        isLoading={false}
        error={null}
      />,
    );
    const link = screen.getByText('Open in Apple Music').closest('a');
    expect(link).toHaveAttribute('href', 'https://music.apple.com/gb/album/mezzanine/123456');
  });
});
