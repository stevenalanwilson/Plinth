import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, RenderResult, screen } from '@testing-library/react';
import { RecommendationCard } from './RecommendationCard';

// The empty state's own example is tested with it; here it stays on the waiting message.
vi.mock('../example/useExampleAlbum', () => ({ useExampleAlbum: () => null }));

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
        feedback={null}
        onFeedback={vi.fn()}
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
        feedback={null}
        onFeedback={vi.fn()}
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
        feedback={null}
        onFeedback={vi.fn()}
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
        feedback={null}
        onFeedback={vi.fn()}
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
        feedback={null}
        onFeedback={vi.fn()}
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
        feedback={null}
        onFeedback={vi.fn()}
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
        feedback={null}
        onFeedback={vi.fn()}
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
        feedback={null}
        onFeedback={vi.fn()}
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
        feedback={null}
        onFeedback={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });

  describe('feedback', () => {
    function renderCard(
      overrides: Partial<React.ComponentProps<typeof RecommendationCard>> = {},
    ): RenderResult {
      return render(
        <RecommendationCard
          recommendation={mockRec}
          artworkResponse={mockArtwork}
          artistRelations={[]}
          isLoadingRelations={false}
          isLoading={false}
          error={null}
          onSeedArtist={vi.fn()}
          feedback={null}
          onFeedback={vi.fn()}
          {...overrides}
        />,
      );
    }

    it('asks for the listener’s take on the pick', () => {
      renderCard();

      expect(screen.getByRole('group', { name: 'Your take' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Own it' })).toBeInTheDocument();
    });

    it('shows the verdict already given', () => {
      renderCard({ feedback: 'want-vinyl' });

      expect(screen.getByRole('button', { name: 'Want on vinyl' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('passes a tap on to onFeedback, and a second tap as a clear', () => {
      const onFeedback = vi.fn();
      renderCard({ feedback: 'own', onFeedback });

      fireEvent.click(screen.getByRole('button', { name: 'Heard it' }));
      fireEvent.click(screen.getByRole('button', { name: 'Own it' }));

      expect(onFeedback).toHaveBeenNthCalledWith(1, 'heard');
      expect(onFeedback).toHaveBeenNthCalledWith(2, null);
    });

    it.each([
      ['loading', { isLoading: true, recommendation: null }],
      ['an error', { error: 'Something went wrong', recommendation: null }],
      ['no pick', { recommendation: null }],
    ])('does not ask while there is %s', (_name, overrides) => {
      renderCard(overrides);

      expect(screen.queryByRole('group', { name: 'Your take' })).not.toBeInTheDocument();
    });
  });
});
