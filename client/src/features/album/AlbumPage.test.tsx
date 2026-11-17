import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AlbumDetailsResponse, AlbumResponse } from '@shared/types';

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  fetchAlbum: vi.fn(),
  fetchAlbumDetails: vi.fn(),
}));

import { ApiError, fetchAlbum, fetchAlbumDetails } from '../../services/apiClient';
import { AlbumPage } from './AlbumPage';

const mockFetchAlbum = vi.mocked(fetchAlbum);
const mockFetchAlbumDetails = vi.mocked(fetchAlbumDetails);

const DETAILS: AlbumDetailsResponse = {
  release: { date: '1980-11', country: 'GB', label: 'Korova', catalogueNumber: 'KODE 2' },
  formats: ['12" Vinyl'],
  discs: [
    {
      position: 1,
      title: null,
      format: '12" Vinyl',
      tracks: [{ number: 'A1', title: "I Can't Escape Myself", lengthSeconds: 236 }],
    },
  ],
  moreFromArtist: null,
};

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

function DiscoverState(): React.ReactElement {
  return <div data-testid="discover-state">{JSON.stringify(useLocation().state)}</div>;
}

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
  mockFetchAlbumDetails.mockResolvedValue(DETAILS);
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

  it('shows the tracklist and release facts below the album', async () => {
    mockFetchAlbum.mockResolvedValue(ALBUM);

    renderPage();

    expect(await screen.findByText("I Can't Escape Myself")).toBeInTheDocument();
    expect(screen.getByText('November 1980')).toBeInTheDocument();
    expect(mockFetchAlbumDetails).toHaveBeenCalledWith(
      'the-sound-jeopardy',
      expect.any(AbortSignal),
    );
  });

  it('shows the album at once, and the details when they arrive', async () => {
    mockFetchAlbum.mockResolvedValue(ALBUM);
    mockFetchAlbumDetails.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Jeopardy' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading album details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find me something like this' })).toBeInTheDocument();
  });

  it('keeps the album when only the details fail', async () => {
    mockFetchAlbum.mockResolvedValue(ALBUM);
    mockFetchAlbumDetails.mockRejectedValue(
      new ApiError("Couldn't load the album details. Please try again.", 502),
    );

    renderPage();

    expect(
      await screen.findByText("Couldn't load the album details. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Jeopardy' })).toBeInTheDocument();
  });

  it('does not ask for details for an album that does not exist', async () => {
    mockFetchAlbum.mockRejectedValue(new ApiError('Album not found', 404));

    renderPage('nope');

    await screen.findByText("We couldn't find that album.");
    expect(mockFetchAlbumDetails).not.toHaveBeenCalled();
  });

  it('has a Share button for the album', async () => {
    mockFetchAlbum.mockResolvedValue(ALBUM);

    renderPage();

    expect(await screen.findByRole('button', { name: 'Share' })).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole('link', { name: 'Or set your own vibe' }));

    expect(document.title).toBe('Plinth');
  });

  it('takes you to Discover from the call to action and from the wordmark', async () => {
    mockFetchAlbum.mockResolvedValue(ALBUM);
    renderPage();

    await userEvent.click(await screen.findByRole('link', { name: 'Or set your own vibe' }));
    expect(screen.getByText('Discover page')).toBeInTheDocument();
  });

  it('sends you to Discover asking for more like this album', async () => {
    mockFetchAlbum.mockResolvedValue(ALBUM);
    render(
      <MemoryRouter initialEntries={['/album/the-sound-jeopardy']}>
        <Routes>
          <Route path="/album/:slug" element={<AlbumPage />} />
          <Route path="/" element={<DiscoverState />} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Find me something like this' }),
    );

    expect(screen.getByTestId('discover-state')).toHaveTextContent(
      JSON.stringify({ moreLikeThis: { artist: 'The Sound', album: 'Jeopardy' } }),
    );
  });

  it('says so when the album does not exist, and still offers a way in', async () => {
    mockFetchAlbum.mockRejectedValue(new ApiError('Album not found', 404));

    renderPage('nope');

    expect(await screen.findByText("We couldn't find that album.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get your own pick' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Find me something like this' }),
    ).not.toBeInTheDocument();
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
