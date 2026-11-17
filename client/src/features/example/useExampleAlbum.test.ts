import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { AlbumResponse } from '@shared/types';

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  fetchExampleAlbum: vi.fn(),
}));

import { ApiError, fetchExampleAlbum } from '../../services/apiClient';
import { useExampleAlbum } from './useExampleAlbum';

const mockFetchExampleAlbum = vi.mocked(fetchExampleAlbum);

const ALBUM: AlbumResponse = {
  slug: 'the-sound-jeopardy',
  releaseGroupId: 'rg-1',
  artist: 'The Sound',
  album: 'Jeopardy',
  year: '1980',
  hook: 'A hook.',
  genres: [],
  country: null,
  artworkUrl: 'https://coverartarchive.org/release/x/1-500.jpg',
  appleMusicUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useExampleAlbum', () => {
  it('starts with nothing, then has the example', async () => {
    mockFetchExampleAlbum.mockResolvedValue(ALBUM);

    const { result } = renderHook(() => useExampleAlbum());

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual(ALBUM));
    expect(mockFetchExampleAlbum).toHaveBeenCalledTimes(1);
  });

  it('stays empty when there is no example yet', async () => {
    mockFetchExampleAlbum.mockRejectedValue(new ApiError('No example album yet', 404));

    const { result } = renderHook(() => useExampleAlbum());

    await waitFor(() => expect(mockFetchExampleAlbum).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current).toBeNull();
  });

  it('stays empty when the request fails', async () => {
    mockFetchExampleAlbum.mockRejectedValue(new Error('Failed to fetch'));

    const { result } = renderHook(() => useExampleAlbum());

    await waitFor(() => expect(mockFetchExampleAlbum).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current).toBeNull();
  });

  it('cancels the request when unmounted, and ignores a late answer', async () => {
    let resolve: (album: AlbumResponse) => void = () => undefined;
    mockFetchExampleAlbum.mockReturnValue(new Promise((done) => (resolve = done)));

    const { result, unmount } = renderHook(() => useExampleAlbum());
    const signal = mockFetchExampleAlbum.mock.calls[0][0];
    unmount();
    resolve(ALBUM);
    await Promise.resolve();

    expect(signal?.aborted).toBe(true);
    expect(result.current).toBeNull();
  });
});
