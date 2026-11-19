import { useState, useRef, useCallback } from 'react';
import { ArtistEssentialsResponse } from '@shared/types';
import { fetchArtistEssentials } from '../../services/apiClient';
import { Failure, toFailure } from '../../services/failure';

interface UseArtistEssentialsReturn {
  artist: string;
  setArtist: (name: string) => void;
  result: ArtistEssentialsResponse | null;
  isLoading: boolean;
  error: string | null;
  /** The day's picks are used up: shown calmly, as it isn't a fault. */
  isLimitReached: boolean;
  fetchEssentials: () => Promise<void>;
  clear: () => void;
}

export function useArtistEssentials(): UseArtistEssentialsReturn {
  const [artist, setArtist] = useState('');
  const [result, setResult] = useState<ArtistEssentialsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const error = failure?.message ?? null;
  const isLimitReached = failure?.isLimitReached ?? false;
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchEssentials = useCallback(async (): Promise<void> => {
    if (artist.trim() === '') {
      setFailure({ message: 'Please enter an artist name.', isLimitReached: false });
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setFailure(null);

    try {
      const data = await fetchArtistEssentials(artist.trim(), controller.signal);
      setResult(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setFailure(toFailure(err, 'Something went wrong. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  }, [artist]);

  const clear = useCallback((): void => {
    abortControllerRef.current?.abort();
    setArtist('');
    setResult(null);
    setFailure(null);
    setIsLoading(false);
  }, []);

  return { artist, setArtist, result, isLoading, error, isLimitReached, fetchEssentials, clear };
}
