import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AlbumResponse } from '@shared/types';

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  fetchAlbum: vi.fn(),
}));

import { ApiError, fetchAlbum } from '../../services/apiClient';
import { AlbumPage } from './AlbumPage';

const mockFetchAlbum = vi.mocked(fetchAlbum);

// Placeholder sleeves repeat the album and artist, so text queries skip them.
const NOT_IN_SLEEVE = { ignore: '[role="img"] *, script, style' };

const ALBUM: AlbumResponse = {
  slug: 'the-sound-jeopardy',
  releaseGroupId: 'rg-1',
  artist: 'The Sound',
  album: 'Jeopardy',
  year: '1980',
  hook: 'Post-punk with its heart on its sleeve.',
  genres: ['Post-punk', 'New Wave'],
  country: 'United Kingdom',
  artworkUrl: 'https://coverartarchive.org/release/x/1-500.jpg',
  appleMusicUrl: 'https://music.apple.com/gb/album/jeopardy/1',
};

function renderPage(slug = 'the-sound-jeopardy'): void {
  render(
    <MemoryRouter initialEntries={[`/album/${slug}`]}>
      <Routes>
        <Route path="/album/:slug" element={<AlbumPage />} />
        <Route path="/" element={<div>Discover page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  document.title = 'Plinth';
});

afterEach(() => {
  document.title = 'Plinth';
});

describe('AlbumPage', () => {
  it('shows a loading state while the album loads', () => {
    mockFetchAlbum.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText('Loading album…')).toBeInTheDocument();
  });

  it('shows the album, its hook, details and listening links', async () => {
    mockFetchAlbum.mockResolvedValue(ALBUM);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Jeopardy' })).toBeInTheDocument();
    expect(screen.getByText('The Sound', NOT_IN_SLEEVE)).toBeInTheDocument();
    expect(screen.getByText('1980', NOT_IN_SLEEVE)).toBeInTheDocument();
    expect(screen.getByText(ALBUM.hook as string)).toBeInTheDocument();
    expect(screen.getByText('Post-punk · New Wave · United Kingdom')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in Apple Music/ })).toHaveAttribute(
      'href',
      ALBUM.appleMusicUrl,
    );
    expect(screen.getByRole('link', { name: /Search in Spotify/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Search in Discogs/ })).toBeInTheDocument();
  });

  it('shows the cover through the image proxy', async () => {
    mockFetchAlbum.mockResolvedValue(ALBUM);

    renderPage();

    const cover = await screen.findByAltText('Jeopardy album artwork');
    expect(cover.getAttribute('src')).toContain('/api/v1/image?url=');
    expect(cover.getAttribute('src')).toContain(encodeURIComponent(ALBUM.artworkUrl as string));
  });

  it('shows the placeholder sleeve when the album has no cover', async () => {
    mockFetchAlbum.mockResolvedValue({ ...ALBUM, artworkUrl: null });

    renderPage();

    expect(
      await screen.findByRole('img', { name: 'Jeopardy by The Sound, no artwork available' }),
    ).toBeInTheDocument();
  });

  it('copes with an album that has no hook, genres, country or Apple Music link', async () => {
    mockFetchAlbum.mockResolvedValue({
      ...ALBUM,
      hook: null,
      genres: [],
      country: null,
      year: null,
      appleMusicUrl: null,
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Jeopardy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Search in Apple Music/ })).toBeInTheDocument();
  });

  it('puts the album in the browser tab title, and restores it on leaving', async () => {
    mockFetchAlbum.mockResolvedValue(ALBUM);

    renderPage();
    await screen.findByRole('heading', { name: 'Jeopardy' });
    expect(document.title).toBe('Jeopardy by The Sound · Plinth');

    await userEvent.click(screen.getByRole('link', { name: 'Get your own pick' }));

    expect(document.title).toBe('Plinth');
  });

  it('takes you to Discover from the call to action and from the wordmark', async () => {
    mockFetchAlbum.mockResolvedValue(ALBUM);
    renderPage();

    await userEvent.click(await screen.findByRole('link', { name: 'Get your own pick' }));
    expect(screen.getByText('Discover page')).toBeInTheDocument();
  });

  it('says so when the album does not exist, and still offers a way in', async () => {
    mockFetchAlbum.mockRejectedValue(new ApiError('Album not found', 404));

    renderPage('nope');

    expect(await screen.findByText("We couldn't find that album.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get your own pick' })).toBeInTheDocument();
  });

  it('shows other errors and lets you try again', async () => {
    mockFetchAlbum
      .mockRejectedValueOnce(new ApiError('Too many requests', 429))
      .mockResolvedValueOnce(ALBUM);
    renderPage();

    expect(await screen.findByText('Too many requests')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Jeopardy' })).toBeInTheDocument();
  });
});
