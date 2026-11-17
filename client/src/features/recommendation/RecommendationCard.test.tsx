import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecommendationCard } from './RecommendationCard';

// Placeholder sleeves repeat the album and artist, so text queries skip them.
const NOT_IN_SLEEVE = { ignore: '[role="img"] *, script, style' };

const mockRec = {
  artist: 'Massive Attack',
  album: 'Mezzanine',
  year: '1998',
  reason: 'A perfect album for your taste.',
};

const mockArtwork = { artworkUrl: null, year: '1998', appleMusicUrl: null };
const mockArtworkWithLink = {
  artworkUrl: null,
  year: '1998',
  appleMusicUrl: 'https://music.apple.com/gb/album/mezzanine/123456',
};

describe('RecommendationCard', () => {
  it('renders the empty state when no recommendation', () => {
    render(
      <RecommendationCard
        recommendation={null}
        artworkResponse={null}
        artistRelations={[]}
        isLoadingRelations={false}
        isLoading={false}
        error={null}
        onSeedArtist={vi.fn()}
      />,
    );
    expect(screen.getByText(/next favourite album is waiting/)).toBeInTheDocument();
  });

  it('renders the loading state', () => {
    render(
      <RecommendationCard
        recommendation={null}
        artworkResponse={null}
        artistRelations={[]}
        isLoadingRelations={false}
        isLoading={true}
        error={null}
        onSeedArtist={vi.fn()}
      />,
    );
    expect(screen.getByText(/Finding your next favourite/)).toBeInTheDocument();
  });

  it('renders an error message', () => {
    render(
      <RecommendationCard
        recommendation={null}
        artworkResponse={null}
        artistRelations={[]}
        isLoadingRelations={false}
        isLoading={false}
        error="API error"
        onSeedArtist={vi.fn()}
      />,
    );
    expect(screen.getByText('API error')).toBeInTheDocument();
  });

  it('renders a recommendation card', () => {
    render(
      <RecommendationCard
        recommendation={mockRec}
        artworkResponse={mockArtwork}
        artistRelations={[]}
        isLoadingRelations={false}
        isLoading={false}
        error={null}
        onSeedArtist={vi.fn()}
      />,
    );
    expect(screen.getByText('Mezzanine', NOT_IN_SLEEVE)).toBeInTheDocument();
    expect(screen.getByText('Massive Attack', NOT_IN_SLEEVE)).toBeInTheDocument();
    expect(screen.getByText('1998')).toBeInTheDocument();
    expect(screen.getByText('A perfect album for your taste.')).toBeInTheDocument();
  });

  it('shows a placeholder sleeve instead of artwork when there is none', () => {
    render(
      <RecommendationCard
        recommendation={mockRec}
        artworkResponse={mockArtwork}
        artistRelations={[]}
        isLoadingRelations={false}
        isLoading={false}
        error={null}
        onSeedArtist={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Mezzanine by Massive Attack, no artwork available' }),
    ).toBeInTheDocument();
  });

  it('renders the Apple Music search link when no direct URL is available', () => {
    render(
      <RecommendationCard
        recommendation={mockRec}
        artworkResponse={mockArtwork}
        artistRelations={[]}
        isLoadingRelations={false}
        isLoading={false}
        error={null}
        onSeedArtist={vi.fn()}
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
        artistRelations={[]}
        isLoadingRelations={false}
        isLoading={false}
        error={null}
        onSeedArtist={vi.fn()}
      />,
    );
    const link = screen.getByText('Open in Apple Music').closest('a');
    expect(link).toHaveAttribute('href', 'https://music.apple.com/gb/album/mezzanine/123456');
  });

  it('offers to share a pick that has its own page', () => {
    render(
      <RecommendationCard
        recommendation={{ ...mockRec, slug: 'massive-attack-mezzanine', hook: 'A hook.' }}
        artworkResponse={mockArtwork}
        artistRelations={[]}
        isLoadingRelations={false}
        isLoading={false}
        error={null}
        onSeedArtist={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('does not offer to share a pick with no page of its own', () => {
    render(
      <RecommendationCard
        recommendation={mockRec}
        artworkResponse={mockArtwork}
        artistRelations={[]}
        isLoadingRelations={false}
        isLoading={false}
        error={null}
        onSeedArtist={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });
});
