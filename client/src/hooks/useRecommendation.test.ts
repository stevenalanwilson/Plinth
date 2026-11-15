import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { RecommendationResponse } from '@shared/types';
import { HistoryEntry } from '../types/history';

vi.mock('../services/apiClient', () => ({
  fetchRecommendation: vi.fn(),
  fetchArtwork: vi.fn(),
  fetchArtistRelations: vi.fn(),
}));

import { fetchRecommendation, fetchArtwork, fetchArtistRelations } from '../services/apiClient';
import { useRecommendation } from './useRecommendation';

const mockFetchRecommendation = vi.mocked(fetchRecommendation);
const mockFetchArtwork = vi.mocked(fetchArtwork);
const mockFetchArtistRelations = vi.mocked(fetchArtistRelations);

const recommendation: RecommendationResponse = {
  artist: 'Massive Attack',
  album: 'Mezzanine',
  year: '1998',
  reason: 'A perfect fit.',
};

const artwork = {
  artworkUrl: 'https://coverartarchive.org/mezzanine.jpg',
  year: '1998',
  appleMusicUrl: null,
};

function storedEntry(index: number): HistoryEntry {
  return {
    id: `stored-${index}`,
    recommendation: {
      artist: `Artist ${index}`,
      album: `Album ${index}`,
      year: '2000',
      reason: 'r',
    },
    artworkResponse: {
      artworkUrl: `https://coverartarchive.org/${index}.jpg`,
      year: '2000',
      appleMusicUrl: null,
    },
    createdAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockFetchRecommendation.mockResolvedValue(recommendation);
  mockFetchArtistRelations.mockResolvedValue({ relations: [] });
});

describe('useRecommendation', () => {
  it('keeps the recommendation when the artwork lookup fails', async () => {
    mockFetchArtwork.mockRejectedValue(new Error('Too many requests'));
    const { result } = renderHook(() => useRecommendation());

    await act(() => result.current.fetchRecommendation());

    expect(result.current.recommendation).toEqual(recommendation);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.history).toHaveLength(1);
    await waitFor(() => expect(mockFetchArtwork).toHaveBeenCalledTimes(1));
    expect(result.current.artworkResponse?.artworkUrl).toBeNull();
  });

  it('shows the recommendation before artwork arrives, then fills the artwork in', async () => {
    let resolveArtwork: (value: typeof artwork) => void = () => {};
    mockFetchArtwork.mockReturnValue(
      new Promise((resolve) => {
        resolveArtwork = resolve;
      }),
    );
    const { result } = renderHook(() => useRecommendation());

    await act(() => result.current.fetchRecommendation());

    expect(result.current.recommendation).toEqual(recommendation);
    expect(result.current.artworkResponse?.artworkUrl).toBeNull();

    await waitFor(() =>
      expect(mockFetchArtwork).toHaveBeenCalledWith('Massive Attack', 'Mezzanine', undefined),
    );
    await act(async () => resolveArtwork(artwork));

    expect(result.current.artworkResponse).toEqual(artwork);
    expect(result.current.history[0].artworkResponse).toEqual(artwork);
  });

  it('looks artwork up by release group when the pick was matched', async () => {
    mockFetchRecommendation.mockResolvedValue({
      ...recommendation,
      releaseGroupId: 'rg-mezzanine',
    });
    mockFetchArtwork.mockResolvedValue(artwork);
    const { result } = renderHook(() => useRecommendation());

    await act(() => result.current.fetchRecommendation());

    await waitFor(() =>
      expect(mockFetchArtwork).toHaveBeenCalledWith('Massive Attack', 'Mezzanine', 'rg-mezzanine'),
    );
  });

  it('fetches artwork for a new recommendation when history is already full', async () => {
    const fullHistory = Array.from({ length: 50 }, (_, index) => storedEntry(index));
    localStorage.setItem('album-recommender-history', JSON.stringify(fullHistory));
    mockFetchArtwork.mockResolvedValue(artwork);
    const { result } = renderHook(() => useRecommendation());

    await act(() => result.current.fetchRecommendation());

    expect(result.current.history).toHaveLength(50);
    await waitFor(() => expect(result.current.artworkResponse).toEqual(artwork));
    expect(mockFetchArtwork).toHaveBeenCalledWith('Massive Attack', 'Mezzanine', undefined);
  });
});
