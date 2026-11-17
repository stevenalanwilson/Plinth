import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AlbumResponse } from '@shared/types';

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  fetchAlbum: vi.fn(),
}));

import { ApiError, fetchAlbum } from '../../services/apiClient';
import { useAlbum } from './useAlbum';

const mockFetchAlbum = vi.mocked(fetchAlbum);

const ALBUM: AlbumResponse = {
  slug: 'the-sound-jeopardy',
  releaseGroupId: 'rg-1',
  artist: 'The Sound',
  album: 'Jeopardy',
  year: '1980',
  hook: 'A hook.',
  genres: ['Post-punk'],
  country: 'United Kingdom',
  artworkUrl: null,
  appleMusicUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAlbum', () => {
  it('starts loading, then has the album', async () => {
    mockFetchAlbum.mockResolvedValue(ALBUM);

    const { result } = renderHook(() => useAlbum('the-sound-jeopardy'));

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', album: ALBUM }));
    expect(mockFetchAlbum).toHaveBeenCalledWith('the-sound-jeopardy', expect.any(AbortSignal));
  });

  it('reports a slug that is not stored as not found', async () => {
    mockFetchAlbum.mockRejectedValue(new ApiError('Album not found', 404));

    const { result } = renderHook(() => useAlbum('nope'));

    await waitFor(() => expect(result.current.state).toEqual({ status: 'not-found' }));
  });

  it('reports other failures with their message', async () => {
    mockFetchAlbum.mockRejectedValue(new ApiError('Too many requests', 429));

    const { result } = renderHook(() => useAlbum('the-sound-jeopardy'));

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'error', message: 'Too many requests' }),
    );
  });

  it('retries after an error', async () => {
    mockFetchAlbum.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(ALBUM);
    const { result } = renderHook(() => useAlbum('the-sound-jeopardy'));
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    act(() => result.current.retry());

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', album: ALBUM }));
  });

  it('loads the new album when the slug changes, and ignores the old response', async () => {
    let resolveFirst: (album: AlbumResponse) => void = () => {};
    mockFetchAlbum.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    mockFetchAlbum.mockResolvedValueOnce({ ...ALBUM, slug: 'can-tago-mago', album: 'Tago Mago' });

    const { result, rerender } = renderHook(({ slug }) => useAlbum(slug), {
      initialProps: { slug: 'the-sound-jeopardy' },
    });
    rerender({ slug: 'can-tago-mago' });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => resolveFirst(ALBUM));

    expect(result.current.state).toMatchObject({
      status: 'ready',
      album: { slug: 'can-tago-mago' },
    });
  });
});
