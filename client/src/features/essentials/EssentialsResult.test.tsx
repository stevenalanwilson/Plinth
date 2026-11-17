import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ArtistEssentialsResponse, EssentialAlbum } from '@shared/types';
import { EssentialsResult } from './EssentialsResult';

function essential(album: string, year: string, startHere: boolean): EssentialAlbum {
  return { album, year, reason: `Why ${album}.`, releaseGroupId: `rg-${album}`, startHere };
}

const CHECKED: ArtistEssentialsResponse = {
  artist: 'Talk Talk',
  albums: [
    essential('Spirit of Eden', '1988', true),
    essential('The Colour of Spring', '1986', true),
    essential('Laughing Stock', '1991', false),
  ],
  discography: [
    { title: 'The Party’s Over', year: '1982', releaseGroupId: 'rg-The Party’s Over' },
    { title: 'The Colour of Spring', year: '1986', releaseGroupId: 'rg-The Colour of Spring' },
    { title: 'Spirit of Eden', year: '1988', releaseGroupId: 'rg-Spirit of Eden' },
    { title: 'Laughing Stock', year: '1991', releaseGroupId: 'rg-Laughing Stock' },
    { title: 'Undated', year: null, releaseGroupId: 'rg-Undated' },
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

  it('follows with the rest of the discography in order, essentials with their reasons', () => {
    render(<EssentialsResult result={CHECKED} />);

    const rest = section('Then the rest');
    const items = within(rest).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('The Party’s Over'),
      expect.stringContaining('Laughing Stock'),
      expect.stringContaining('Undated'),
    ]);
    expect(within(items[0]).getByText('1982')).toBeInTheDocument();
    expect(within(items[0]).queryByRole('img')).not.toBeInTheDocument();
    expect(within(items[1]).getByText('Why Laughing Stock.')).toBeInTheDocument();
    expect(within(items[1]).getByAltText('Laughing Stock album artwork')).toBeInTheDocument();
    expect(within(items[2]).getByText('—')).toBeInTheDocument();
  });

  it('shows the placeholder sleeve when a cover fails to load', () => {
    render(<EssentialsResult result={CHECKED} />);

    fireEvent.error(screen.getByAltText('Spirit of Eden album artwork'));

    expect(screen.queryByAltText('Spirit of Eden album artwork')).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Spirit of Eden by Talk Talk, no artwork available' }),
    ).toBeInTheDocument();
  });

  it('lists the other essentials on their own when there is no discography', () => {
    render(<EssentialsResult result={{ artist: 'Talk Talk', albums: CHECKED.albums }} />);

    expect(screen.queryByRole('region', { name: 'Then the rest' })).not.toBeInTheDocument();
    expect(
      within(section('Then these')).getByRole('heading', { name: 'Laughing Stock' }),
    ).toBeInTheDocument();
  });

  it('uses placeholder sleeves for a list that could not be checked', () => {
    const unchecked = CHECKED.albums.map((album) => ({ ...album, releaseGroupId: undefined }));

    render(<EssentialsResult result={{ artist: 'Talk Talk', albums: unchecked }} />);

    expect(screen.queryByAltText(/album artwork/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('shows one plain list when nothing is marked to start with', () => {
    const unmarked = CHECKED.albums.map((album) => ({ ...album, startHere: undefined }));

    render(<EssentialsResult result={{ ...CHECKED, albums: unmarked }} />);

    expect(screen.queryByRole('region', { name: 'Start here' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(3);
  });

  it('says "three" when there are three albums to start with', () => {
    const three = CHECKED.albums.map((album) => ({ ...album, startHere: true }));

    render(<EssentialsResult result={{ ...CHECKED, albums: three }} />);

    expect(screen.getByText('The three albums to begin with, and why.')).toBeInTheDocument();
  });

  it('offers recommendations from the artist', () => {
    const onSeedArtist = vi.fn();
    render(<EssentialsResult result={CHECKED} onSeedArtist={onSeedArtist} />);

    fireEvent.click(screen.getByRole('button', { name: /recommend from this artist/i }));

    expect(onSeedArtist).toHaveBeenCalledWith('Talk Talk');
  });
});
