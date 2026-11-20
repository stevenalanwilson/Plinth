import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AlbumResponse } from '@shared/types';
import { ExampleAlbum } from './ExampleAlbum';

const ALBUM: AlbumResponse = {
  slug: 'the-sound-jeopardy',
  releaseGroupId: 'rg-1',
  artist: 'The Sound',
  album: 'Jeopardy',
  year: '1980',
  hook: 'Post-punk with its heart on its sleeve.',
  genres: ['Post-punk'],
  country: 'United Kingdom',
  artworkUrl: 'https://coverartarchive.org/release/x/1-500.jpg',
  appleMusicUrl: null,
};

// Placeholder sleeves repeat the album and artist, so text queries skip them.
const NOT_IN_SLEEVE = { ignore: '[role="img"] *, script, style' };

function renderExample(album: AlbumResponse = ALBUM): void {
  render(
    <MemoryRouter>
      <ExampleAlbum album={album} />
    </MemoryRouter>,
  );
}

describe('ExampleAlbum', () => {
  it('says it is an example and shows the album', () => {
    renderExample();

    expect(screen.getByRole('article', { name: 'Jeopardy' })).toBeInTheDocument();
    expect(screen.getByText('Example')).toBeInTheDocument();
    expect(screen.getByText(/Not picked for you/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Jeopardy' })).toBeInTheDocument();
    expect(screen.getByText('The Sound')).toBeInTheDocument();
    expect(screen.getByText('1980')).toBeInTheDocument();
    expect(screen.getByText('Post-punk with its heart on its sleeve.')).toBeInTheDocument();
    expect(screen.getByText(/Set your vibe and Plinth will find one for you/)).toBeInTheDocument();
  });

  it('shows the cover through the image proxy', () => {
    renderExample();

    expect(screen.getByAltText('Jeopardy album artwork')).toHaveAttribute(
      'src',
      expect.stringContaining(
        `/api/v1/image?url=${encodeURIComponent('https://coverartarchive.org/release/x/1-500.jpg')}`,
      ),
    );
  });

  it('falls back to the placeholder sleeve when the cover fails to load', () => {
    renderExample();

    fireEvent.error(screen.getByAltText('Jeopardy album artwork'));

    expect(screen.queryByAltText('Jeopardy album artwork')).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('links to the album page', () => {
    renderExample();

    expect(screen.getByRole('link', { name: 'See the album' })).toHaveAttribute(
      'href',
      '/album/the-sound-jeopardy',
    );
  });

  it('leaves out a missing year and hook', () => {
    renderExample({ ...ALBUM, year: null, hook: null, artworkUrl: null });

    expect(screen.queryByText('1980')).not.toBeInTheDocument();
    expect(screen.queryByText(/heart on its sleeve/)).not.toBeInTheDocument();
    expect(screen.getByText('The Sound', NOT_IN_SLEEVE)).toBeInTheDocument();
  });
});
