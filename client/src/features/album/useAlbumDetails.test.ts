import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AlbumDetailsResponse } from '@shared/types';

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  fetchAlbumDetails: vi.fn(),
}));

import { ApiError, fetchAlbumDetails } from '../../services/apiClient';
import { useAlbumDetails } from './useAlbumDetails';

const mockFetchAlbumDetails = vi.mocked(fetchAlbumDetails);

const DETAILS: AlbumDetailsResponse = {
  release: { date: '1980-11', country: 'GB', label: 'Korova', catalogueNumber: 'KODE 2' },
  formats: ['12" Vinyl'],
  discs: [],
  moreFromArtist: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAlbumDetails', () => {
  it('starts loading, then has the details', async () => {
    mockFetchAlbumDetails.mockResolvedValue(DETAILS);

    const { result } = renderHook(() => useAlbumDetails('the-sound-jeopardy'));

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'ready', details: DETAILS }),
    );
    expect(mockFetchAlbumDetails).toHaveBeenCalledWith(
      'the-sound-jeopardy',
      expect.any(AbortSignal),
    );
  });

  it('reports a failure with the server message', async () => {
    mockFetchAlbumDetails.mockRejectedValue(
      new ApiError("Couldn't load the album details. Please try again.", 502),
    );

    const { result } = renderHook(() => useAlbumDetails('the-sound-jeopardy'));

    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'error',
        message: "Couldn't load the album details. Please try again.",
      }),
    );
  });

  it('retries after a failure', async () => {
    mockFetchAlbumDetails
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(DETAILS);
    const { result } = renderHook(() => useAlbumDetails('the-sound-jeopardy'));
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    act(() => result.current.retry());

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'ready', details: DETAILS }),
    );
  });

  it('ignores a response for a slug it has since left', async () => {
    let resolveFirst: (details: AlbumDetailsResponse) => void = () => {};
    mockFetchAlbumDetails.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    );
    const other = { ...DETAILS, formats: ['CD'] };
    mockFetchAlbumDetails.mockResolvedValueOnce(other);

    const { result, rerender } = renderHook(({ slug }) => useAlbumDetails(slug), {
      initialProps: { slug: 'the-sound-jeopardy' },
    });
    rerender({ slug: 'can-tago-mago' });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => resolveFirst(DETAILS));

    expect(result.current.state).toEqual({ status: 'ready', details: other });
  });

  it('does not report a cancelled request as a failure', async () => {
    mockFetchAlbumDetails.mockImplementation(
      (_slug, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );

    const { result, unmount } = renderHook(() => useAlbumDetails('the-sound-jeopardy'));
    unmount();

    expect(result.current.state).toEqual({ status: 'loading' });
  });
});
