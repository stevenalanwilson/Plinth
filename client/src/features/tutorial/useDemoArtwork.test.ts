import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../services/apiClient', () => ({
  fetchArtwork: vi.fn(),
  getProxiedArtworkUrl: (url: string) => `/proxied?url=${url}`,
}));

import { fetchArtwork } from '../../services/apiClient';
import { useDemoArtwork } from './useDemoArtwork';

const mockFetchArtwork = vi.mocked(fetchArtwork);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDemoArtwork', () => {
  it('finds the cover the way a pick does, and serves it through the image proxy', async () => {
    mockFetchArtwork.mockResolvedValue({
      artworkUrl: 'https://covers.example/kind-of-blue.jpg',
      year: '1959',
      appleMusicUrl: null,
    });

    const { result } = renderHook(() => useDemoArtwork('Miles Davis', 'Kind of Blue', true));

    expect(result.current).toBeNull();
    await waitFor(() =>
      expect(result.current).toBe('/proxied?url=https://covers.example/kind-of-blue.jpg'),
    );
    expect(mockFetchArtwork).toHaveBeenCalledWith('Miles Davis', 'Kind of Blue');
  });

  it('stays null when there is no confident cover', async () => {
    mockFetchArtwork.mockResolvedValue({ artworkUrl: null, year: null, appleMusicUrl: null });

    const { result } = renderHook(() => useDemoArtwork('Miles Davis', 'Kind of Blue', true));

    await waitFor(() => expect(mockFetchArtwork).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('stays null when the lookup fails', async () => {
    mockFetchArtwork.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useDemoArtwork('Miles Davis', 'Kind of Blue', true));

    await waitFor(() => expect(mockFetchArtwork).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('does not look anything up when the cover will not be shown', () => {
    renderHook(() => useDemoArtwork('Miles Davis', 'Kind of Blue', false));

    expect(mockFetchArtwork).not.toHaveBeenCalled();
  });
});
