import { useState, useEffect, useCallback } from 'react';
import { RecommendationPreferences, RecommendationResponse, ArtworkResponse } from '@shared/types';
import { HistoryEntry } from '../types/history';
import { fetchRecommendation as apiFetchRecommendation, fetchArtwork } from '../services/apiClient';

const HISTORY_STORAGE_KEY = 'album-recommender-history';

const DEFAULT_PREFERENCES: RecommendationPreferences = {
  genres: [],
  moods: [],
  tempo: 5,
  energy: 5,
  density: 5,
  era: 'any',
  includeFamiliarArtists: true,
  prioritiseObscure: false,
  stayFocused: false,
};

function loadHistoryFromStorage(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    // Backfill IDs for entries persisted before the id field was introduced.
    const parsed = JSON.parse(raw) as Array<Omit<HistoryEntry, 'id'> & { id?: string }>;
    return parsed.map((entry) => ({ ...entry, id: entry.id ?? crypto.randomUUID() }));
  } catch {
    return [];
  }
}

function saveHistoryToStorage(history: HistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (err) {
    console.warn('Failed to persist history:', err);
  }
}

interface UseRecommendationReturn {
  preferences: RecommendationPreferences;
  updatePreferences: (partial: Partial<RecommendationPreferences>) => void;
  recommendation: RecommendationResponse | null;
  artworkResponse: ArtworkResponse | null;
  history: HistoryEntry[];
  isLoading: boolean;
  error: string | null;
  fetchRecommendation: () => Promise<void>;
}

export function useRecommendation(): UseRecommendationReturn {
  const [preferences, setPreferences] = useState<RecommendationPreferences>(DEFAULT_PREFERENCES);
  const [recommendation, setRecommendation] = useState<RecommendationResponse | null>(null);
  const [artworkResponse, setArtworkResponse] = useState<ArtworkResponse | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistoryFromStorage);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    saveHistoryToStorage(history);
  }, [history]);

  useEffect(() => {
    const nullEntries = history.filter((e) => e.artworkResponse.artworkUrl === null);
    if (nullEntries.length === 0) return;

    let cancelled = false;

    // Re-fetch artwork sequentially for any history entries missing it.
    // Runs on mount (stale cache) and whenever a new entry is added (fresh recommendation
    // that came back without artwork — e.g. MusicBrainz was temporarily unavailable).
    // Sequential execution respects the 1s delay in artworkService.
    (async () => {
      for (const entry of nullEntries) {
        if (cancelled) break;

        const artwork = await fetchArtwork(entry.recommendation.artist, entry.recommendation.album);

        if (cancelled) break;

        if (artwork.artworkUrl !== null) {
          setHistory((prev) => {
            const updated = prev.map((e) =>
              e.id === entry.id ? { ...e, artworkResponse: artwork } : e,
            );

            // If this is the most recent recommendation, also update artworkResponse
            // so the card refreshes without requiring a page reload.
            if (updated[0]?.id === entry.id) {
              setArtworkResponse(artwork);
            }

            return updated;
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [history.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const updatePreferences = useCallback((partial: Partial<RecommendationPreferences>): void => {
    setPreferences((prev) => ({ ...prev, ...partial }));
  }, []);

  const fetchRecommendation = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    // Read the current history inside a functional update so this callback does not
    // need `history` in its dependency array — avoiding recreation after every recommendation.
    let alreadySuggested: string[] = [];
    setHistory((prev) => {
      alreadySuggested = prev.map((e) => e.recommendation.album);
      return prev;
    });

    try {
      const rec = await apiFetchRecommendation({
        preferences,
        alreadySuggested,
      });

      const artwork = await fetchArtwork(rec.artist, rec.album);

      setRecommendation(rec);
      setArtworkResponse(artwork);

      const newEntry: HistoryEntry = {
        id: crypto.randomUUID(),
        recommendation: rec,
        artworkResponse: artwork,
      };
      setHistory((prev) => [newEntry, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  }, [preferences]);

  return {
    preferences,
    updatePreferences,
    recommendation,
    artworkResponse,
    history,
    isLoading,
    error,
    fetchRecommendation,
  };
}
