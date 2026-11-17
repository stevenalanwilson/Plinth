import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { RecommendationResponse } from '@shared/types';
import { HistoryEntry } from '../types/history';

vi.mock('../services/apiClient', () => ({
  fetchRecommendation: vi.fn(),
  fetchRecommendationArtwork: vi.fn(),
  fetchArtistRelations: vi.fn(),
}));

import {
  fetchRecommendation,
  fetchRecommendationArtwork,
  fetchArtistRelations,
} from '../services/apiClient';
import { useRecommendation } from './useRecommendation';

const mockFetchRecommendation = vi.mocked(fetchRecommendation);
const mockFetchArtwork = vi.mocked(fetchRecommendationArtwork);
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

    await waitFor(() => expect(mockFetchArtwork).toHaveBeenCalledWith(recommendation));
    await act(async () => resolveArtwork(artwork));

    expect(result.current.artworkResponse).toEqual(artwork);
    expect(result.current.history[0].artworkResponse).toEqual(artwork);
  });

  it('passes the whole pick, so artwork can be found by slug or release group', async () => {
    const matched = {
      ...recommendation,
      releaseGroupId: 'rg-mezzanine',
      slug: 'massive-attack-mezzanine',
    };
    mockFetchRecommendation.mockResolvedValue(matched);
    mockFetchArtwork.mockResolvedValue(artwork);
    const { result } = renderHook(() => useRecommendation());

    await act(() => result.current.fetchRecommendation());

    await waitFor(() => expect(mockFetchArtwork).toHaveBeenCalledWith(matched));
  });

  it('fetches artwork for a new recommendation when history is already full', async () => {
    const fullHistory = Array.from({ length: 50 }, (_, index) => storedEntry(index));
    localStorage.setItem('album-recommender-history', JSON.stringify(fullHistory));
    mockFetchArtwork.mockResolvedValue(artwork);
    const { result } = renderHook(() => useRecommendation());

    await act(() => result.current.fetchRecommendation());

    expect(result.current.history).toHaveLength(50);
    await waitFor(() => expect(result.current.artworkResponse).toEqual(artwork));
    expect(mockFetchArtwork).toHaveBeenCalledWith(recommendation);
  });

  it('marks the first pick of a visit that began on a shared link, and only that one', async () => {
    sessionStorage.setItem('plinth-visit-entry', 'shared-link');
    mockFetchRecommendation.mockResolvedValue(recommendation);
    const { result } = renderHook(() => useRecommendation());

    await act(async () => {
      await result.current.fetchRecommendation();
    });
    await act(async () => {
      await result.current.fetchRecommendation();
    });

    expect(mockFetchRecommendation.mock.calls[0][0].entry).toBe('shared-link');
    expect(mockFetchRecommendation.mock.calls[1][0].entry).toBeUndefined();
    sessionStorage.clear();
  });
});

describe('useRecommendation library feedback and retention', () => {
  const STORAGE_KEY = 'album-recommender-history';
  const DAY_MS = 24 * 60 * 60 * 1000;

  function seed(entries: readonly unknown[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  function stored(): HistoryEntry[] {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as HistoryEntry[];
  }

  function aged(index: number, days: number, feedback?: unknown): Record<string, unknown> {
    return {
      ...storedEntry(index),
      createdAt: new Date(Date.now() - days * DAY_MS).toISOString(),
      ...(feedback === undefined ? {} : { feedback }),
    };
  }

  const OWNED = { status: 'own', at: '2026-01-05T10:00:00.000Z' };

  it('keeps a rated album older than 90 days and drops an unrated one', () => {
    seed([aged(1, 5), aged(2, 200, OWNED), aged(3, 200)]);

    const { result } = renderHook(() => useRecommendation());

    expect(result.current.history.map((entry) => entry.id)).toEqual(['stored-1', 'stored-2']);
    expect(result.current.history[1].feedback).toEqual(OWNED);
  });

  it('ignores stored feedback that is malformed', () => {
    seed([aged(1, 5, { status: 'loved', at: 'sometime' }), aged(2, 5, 'own')]);

    const { result } = renderHook(() => useRecommendation());

    expect(result.current.history).toHaveLength(2);
    expect(result.current.history.every((entry) => entry.feedback === undefined)).toBe(true);
  });

  it('records a status with the time it was set, and saves it', () => {
    seed([aged(1, 1)]);
    const { result } = renderHook(() => useRecommendation());
    const before = Date.now();

    act(() => result.current.setFeedback('stored-1', 'want-vinyl'));

    const feedback = result.current.history[0].feedback;
    expect(feedback?.status).toBe('want-vinyl');
    expect(Date.parse(feedback?.at ?? '')).toBeGreaterThanOrEqual(before);
    expect(stored()[0].feedback).toEqual(feedback);
  });

  it('changes a status to another, and the time moves on', async () => {
    seed([aged(1, 1, OWNED)]);
    const { result } = renderHook(() => useRecommendation());

    act(() => result.current.setFeedback('stored-1', 'heard'));

    expect(result.current.history[0].feedback?.status).toBe('heard');
    expect(result.current.history[0].feedback?.at).not.toBe(OWNED.at);
  });

  it('leaves the time alone when the status is set to what it already is', () => {
    seed([aged(1, 1, OWNED)]);
    const { result } = renderHook(() => useRecommendation());

    act(() => result.current.setFeedback('stored-1', 'own'));

    expect(result.current.history[0].feedback).toEqual(OWNED);
  });

  it('clears a status but keeps the time of the clearing', () => {
    seed([aged(1, 1, OWNED)]);
    const { result } = renderHook(() => useRecommendation());

    act(() => result.current.setFeedback('stored-1', null));

    expect(result.current.history[0].feedback?.status).toBeNull();
    expect(result.current.history[0].feedback?.at).not.toBe(OWNED.at);
    expect(stored()[0].feedback?.status).toBeNull();
  });

  it('does not invent feedback to clear on an album that has none', () => {
    seed([aged(1, 1)]);
    const { result } = renderHook(() => useRecommendation());

    act(() => result.current.setFeedback('stored-1', null));

    expect(result.current.history[0].feedback).toBeUndefined();
  });

  it('ignores an id that is not in the library', () => {
    seed([aged(1, 1)]);
    const { result } = renderHook(() => useRecommendation());

    act(() => result.current.setFeedback('nope', 'own'));

    expect(result.current.history[0].feedback).toBeUndefined();
  });

  it('only changes the album it was asked about', () => {
    seed([aged(1, 1), aged(2, 2)]);
    const { result } = renderHook(() => useRecommendation());

    act(() => result.current.setFeedback('stored-2', 'save'));

    expect(result.current.history[0].feedback).toBeUndefined();
    expect(result.current.history[1].feedback?.status).toBe('save');
  });

  it('keeps rated albums when a new pick pushes the unrated ones past 50', async () => {
    const unrated = Array.from({ length: 50 }, (_, index) => aged(index, 1));
    seed([
      ...unrated,
      aged(100, 300, OWNED),
      aged(101, 300, { status: 'not-for-me', at: OWNED.at }),
    ]);
    mockFetchArtwork.mockResolvedValue(artwork);
    const { result } = renderHook(() => useRecommendation());

    await act(() => result.current.fetchRecommendation());

    const ids = result.current.history.map((entry) => entry.id);
    expect(ids).toContain('stored-100');
    expect(ids).toContain('stored-101');
    expect(result.current.history.filter((entry) => entry.feedback === undefined)).toHaveLength(50);
    expect(ids).not.toContain('stored-49');
  });

  it('returns a cleared album to the ordinary limits at the next load, not at once', () => {
    seed([aged(1, 200, OWNED)]);
    const first = renderHook(() => useRecommendation());

    act(() => first.result.current.setFeedback('stored-1', null));
    expect(first.result.current.history).toHaveLength(1);
    first.unmount();

    const second = renderHook(() => useRecommendation());
    expect(second.result.current.history).toHaveLength(0);
  });

  it('keeps the rating when an album is brought back to the front', () => {
    seed([aged(1, 1), aged(2, 2, OWNED)]);
    const { result } = renderHook(() => useRecommendation());

    act(() => result.current.selectFromHistory('stored-2'));

    expect(result.current.history[0].id).toBe('stored-2');
    expect(result.current.history[0].feedback).toEqual(OWNED);
  });
});
