import { useState, useRef, useCallback } from 'react';
import { ArtistEssentialsResponse } from '@shared/types';
import { fetchArtistEssentials } from '../../services/apiClient';

interface UseArtistEssentialsReturn {
  artist: string;
  setArtist: (name: string) => void;
  result: ArtistEssentialsResponse | null;
  isLoading: boolean;
  error: string | null;
  fetchEssentials: () => Promise<void>;
  clear: () => void;
}

export function useArtistEssentials(): UseArtistEssentialsReturn {
  const [artist, setArtist] = useState('');
  const [result, setResult] = useState<ArtistEssentialsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchEssentials = useCallback(async (): Promise<void> => {
    if (artist.trim() === '') {
      setError('Please enter an artist name.');
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchArtistEssentials(artist.trim(), controller.signal);
      setResult(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [artist]);

  const clear = useCallback((): void => {
    abortControllerRef.current?.abort();
    setArtist('');
    setResult(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { artist, setArtist, result, isLoading, error, fetchEssentials, clear };
}
