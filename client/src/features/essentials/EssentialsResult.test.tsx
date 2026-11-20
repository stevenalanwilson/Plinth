import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ArtistEssentialsResponse, ConnectedAlbum, EssentialAlbum } from '@shared/types';
import { EssentialsResult } from './EssentialsResult';

function essential(album: string, year: string): EssentialAlbum {
  return { album, year, reason: `Why ${album}.`, releaseGroupId: `rg-${album}` };
}

function connected(artist: string, album: string, connection: string): ConnectedAlbum {
  return {
    artist,
    album,
    year: '1998',
    connection,
    reason: `Why ${album}.`,
    releaseGroupId: `rg-${album}`,
  };
}

const CHECKED: ArtistEssentialsResponse = {
  artist: 'Talk Talk',
  albums: [essential('Spirit of Eden', '1988'), essential('The Colour of Spring', '1986')],
  related: [
    connected('Mark Hollis', 'Mark Hollis', 'Singer’s solo album'),
    connected('O.Rang', 'Herd of Instinct', 'Side project of two members'),
  ],
};

function section(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

describe('EssentialsResult', () => {
  it('leads with the albums to start with, each with its reason and cover', () => {
    render(<EssentialsResult result={CHECKED} />);

    const startHere = section('Start here');
    expect(
      within(startHere).getByText('The two albums to begin with, and why.'),
    ).toBeInTheDocument();
    expect(
      within(startHere)
        .getAllByRole('heading', { level: 4 })
        .map((heading) => heading.textContent),
    ).toEqual(['Spirit of Eden', 'The Colour of Spring']);
    expect(within(startHere).getByText('Why Spirit of Eden.')).toBeInTheDocument();
    expect(within(startHere).getByAltText('Spirit of Eden album artwork')).toHaveAttribute(
      'src',
      expect.stringContaining(
        encodeURIComponent(
          'https://coverartarchive.org/release-group/rg-Spirit%20of%20Eden/front-250',
        ),
      ),
    );
  });

  it('says "three" when there are three albums to start with', () => {
    render(
      <EssentialsResult
        result={{ ...CHECKED, albums: [...CHECKED.albums, essential('Laughing Stock', '1991')] }}
      />,
    );

    expect(screen.getByText('The three albums to begin with, and why.')).toBeInTheDocument();
  });

  it('follows with albums by the people around the artist, saying who and how they are connected', () => {
    render(<EssentialsResult result={CHECKED} />);

    const related = section('Then the people around them');
    expect(
      within(related)
        .getAllByRole('heading', { level: 4 })
        .map((heading) => heading.textContent),
    ).toEqual(['Mark Hollis', 'Herd of Instinct']);
    expect(within(related).getByText('Mark Hollis · Singer’s solo album')).toBeInTheDocument();
    expect(within(related).getByText('O.Rang · Side project of two members')).toBeInTheDocument();
    expect(within(related).getByText('Why Herd of Instinct.')).toBeInTheDocument();
  });

  it('finds a related album by the name of whoever made it, not the artist searched for', () => {
    render(<EssentialsResult result={CHECKED} />);

    const link = within(section('Then the people around them')).getAllByRole('link', {
      name: /spotify/i,
    })[1];

    expect(link.getAttribute('href')).toContain(encodeURIComponent('O.Rang Herd of Instinct'));
  });

  it('says so, rather than showing an empty list, when no related albums could be confirmed', () => {
    render(<EssentialsResult result={{ ...CHECKED, related: [] }} />);

    const related = section('Then the people around them');
    expect(
      within(related).getByText(/couldn.t confirm any albums connected to Talk Talk/),
    ).toBeInTheDocument();
    expect(within(related).queryByRole('heading', { level: 4 })).not.toBeInTheDocument();
    expect(within(section('Start here')).getAllByRole('heading', { level: 4 })).toHaveLength(2);
  });

  it('shows the placeholder sleeve when a cover fails to load', () => {
    render(<EssentialsResult result={CHECKED} />);

    fireEvent.error(screen.getByAltText('Spirit of Eden album artwork'));

    expect(screen.queryByAltText('Spirit of Eden album artwork')).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Spirit of Eden by Talk Talk, no artwork available' }),
    ).toBeInTheDocument();
  });

  it('uses placeholder sleeves for a list that could not be checked', () => {
    const unchecked: ArtistEssentialsResponse = {
      artist: 'Talk Talk',
      albums: CHECKED.albums.map((album) => ({ ...album, releaseGroupId: undefined })),
      related: CHECKED.related.map((album) => ({ ...album, releaseGroupId: undefined })),
    };

    render(<EssentialsResult result={unchecked} />);

    expect(screen.queryByAltText(/album artwork/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(4);
  });

  it('offers recommendations from the artist', () => {
    const onSeedArtist = vi.fn();
    render(<EssentialsResult result={CHECKED} onSeedArtist={onSeedArtist} />);

    fireEvent.click(screen.getByRole('button', { name: /recommend from this artist/i }));

    expect(onSeedArtist).toHaveBeenCalledWith('Talk Talk');
  });
});
