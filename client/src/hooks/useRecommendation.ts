import { useState, useEffect, useCallback, useRef } from 'react';
import { RecommendationPreferences, RecommendationResponse, ArtworkResponse } from '@shared/types';
import { HistoryEntry } from '../types/history';
import { fetchRecommendation as apiFetchRecommendation, fetchArtwork } from '../services/apiClient';

const HISTORY_STORAGE_KEY = 'album-recommender-history';
// Kept only for the one-time cleanup below — do not read from this key.
const LEGACY_LIBRARY_STORAGE_KEY = 'album-recommender-library';

export const DEFAULT_PREFERENCES: RecommendationPreferences = {
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

const HISTORY_MAX_AGE_DAYS = 90;

function loadHistoryFromStorage(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    // Backfill id/createdAt for entries persisted before these fields were introduced.
    const parsed = JSON.parse(raw) as Array<
      Omit<HistoryEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
    >;
    const cutoff = Date.now() - HISTORY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    return parsed
      .map((entry) => ({
        ...entry,
        id: entry.id ?? crypto.randomUUID(),
        // Entries without a createdAt pre-date this field; treat as now so existing
        // history is preserved rather than immediately pruned.
        createdAt: entry.createdAt ?? new Date().toISOString(),
      }))
      .filter((entry) => new Date(entry.createdAt).getTime() > cutoff);
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
  updatePreferences: (prefs: RecommendationPreferences) => void;
  recommendation: RecommendationResponse | null;
  artworkResponse: ArtworkResponse | null;
  history: HistoryEntry[];
  isLoading: boolean;
  error: string | null;
  fetchRecommendation: () => Promise<void>;
  clearHistory: () => void;
  removeFromHistory: (id: string) => void;
}

export function useRecommendation(): UseRecommendationReturn {
  const [preferences, setPreferences] = useState<RecommendationPreferences>(DEFAULT_PREFERENCES);
  const [recommendation, setRecommendation] = useState<RecommendationResponse | null>(null);
  const [artworkResponse, setArtworkResponse] = useState<ArtworkResponse | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistoryFromStorage);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref so fetchRecommendation can read the current history without needing it
  // in its dependency array. A ref is always up to date; a stale closure is not.
  const historyRef = useRef(history);
  historyRef.current = history;

  // One-time migration: clear stale library data left over from the upload-based flow.
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_LIBRARY_STORAGE_KEY);
    } catch {
      // Silently ignore — localStorage may be unavailable in some environments.
    }
  }, []);

  useEffect(() => {
    saveHistoryToStorage(history);
  }, [history]);

  const artworkRetryCountRef = useRef(0);
  // Tracks the IDs of null-artwork entries from the previous effect run. When new IDs
  // appear (a fresh recommendation with missing artwork), the backoff counter resets so
  // the new entry gets its own full set of retry attempts.
  const artworkRetrySeenIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const nullEntries = history.filter((e) => e.artworkResponse.artworkUrl === null);
    if (nullEntries.length === 0) {
      artworkRetryCountRef.current = 0;
      artworkRetrySeenIdsRef.current = new Set();
      return;
    }

    // If any entry IDs are new since the last run, reset the backoff so they get fresh retries.
    const hasNewEntries = nullEntries.some((e) => !artworkRetrySeenIdsRef.current.has(e.id));
    if (hasNewEntries) {
      artworkRetryCountRef.current = 0;
    }
    artworkRetrySeenIdsRef.current = new Set(nullEntries.map((e) => e.id));

    // Cap retries with exponential backoff to avoid hammering the endpoint when
    // MusicBrainz / Cover Art Archive is down. Max 4 attempts: 0s, 2s, 4s, 8s.
    const MAX_RETRIES = 4;
    if (artworkRetryCountRef.current >= MAX_RETRIES) return;

    const attempt = artworkRetryCountRef.current;
    const delayMs = attempt === 0 ? 0 : Math.pow(2, attempt) * 1000;
    artworkRetryCountRef.current += 1;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    // Re-fetch artwork sequentially for any history entries missing it.
    // Runs on mount (stale cache) and whenever a new entry is added (fresh recommendation
    // that came back without artwork — e.g. MusicBrainz was temporarily unavailable).
    // Sequential execution respects the 1s delay in artworkService.
    timeoutId = setTimeout(async () => {
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
    }, delayMs);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [history.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearHistory = useCallback((): void => {
    setHistory([]);
    setRecommendation(null);
    setArtworkResponse(null);
  }, []);

  const removeFromHistory = useCallback((id: string): void => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      if (prev[0]?.id === id) {
        setRecommendation(null);
        setArtworkResponse(null);
      }
      return next;
    });
  }, []);

  const updatePreferences = useCallback((prefs: RecommendationPreferences): void => {
    setPreferences(prefs);
  }, []);

  // Tracks the in-flight request so a second click cancels the first.
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchRecommendation = useCallback(async (): Promise<void> => {
    // Cancel any in-flight request before starting a new one.
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    const alreadySuggested = historyRef.current.map(
      (e) => `${e.recommendation.artist} – ${e.recommendation.album}`,
    );

    try {
      const rec = await apiFetchRecommendation(
        {
          preferences,
          alreadySuggested,
        },
        controller.signal,
      );

      const artwork = await fetchArtwork(rec.artist, rec.album);

      if (controller.signal.aborted) return;

      setRecommendation(rec);
      setArtworkResponse(artwork);

      const newEntry: HistoryEntry = {
        id: crypto.randomUUID(),
        recommendation: rec,
        artworkResponse: artwork,
        createdAt: new Date().toISOString(),
      };
      setHistory((prev) => [newEntry, ...prev].slice(0, 50));
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
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
    clearHistory,
    removeFromHistory,
  };
}
