import { useState, useRef, useCallback } from 'react';
import { ArtistEssentialsResponse } from '@shared/types';
import { fetchArtistEssentials } from '../../services/apiClient';
import { Failure, toFailure } from '../../services/failure';

/** An artist picked from the suggestions. */
export interface ChosenArtist {
  readonly name: string;
  /** MusicBrainz ID; null for an artist from the crate, who is then searched for by name. */
  readonly id: string | null;
  /** What tells them apart from others with the name. */
  readonly detail: string;
}

interface UseArtistEssentialsReturn {
  artist: string;
  /** Changes what is typed, which un-chooses an artist picked from the suggestions. */
  setArtist: (name: string) => void;
  /** The artist picked from the suggestions, while what is typed is still their name. */
  chosen: ChosenArtist | null;
  /** Fills in the picked artist and looks them up at once. */
  chooseArtist: (artist: ChosenArtist) => Promise<void>;
  result: ArtistEssentialsResponse | null;
  isLoading: boolean;
  error: string | null;
  /** The day's picks are used up: shown calmly, as it isn't a fault. */
  isLimitReached: boolean;
  fetchEssentials: () => Promise<void>;
  clear: () => void;
}

export function useArtistEssentials(): UseArtistEssentialsReturn {
  const [artist, setArtistText] = useState('');
  const [chosen, setChosen] = useState<ChosenArtist | null>(null);
  const [result, setResult] = useState<ArtistEssentialsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const error = failure?.message ?? null;
  const isLimitReached = failure?.isLimitReached ?? false;
  const abortControllerRef = useRef<AbortController | null>(null);

  const lookUp = useCallback(async (name: string, pick: ChosenArtist | null): Promise<void> => {
    if (name === '') {
      setFailure({ message: 'Please enter an artist name.', isLimitReached: false });
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setFailure(null);

    try {
      const choice = pick?.id ? { id: pick.id, detail: pick.detail } : undefined;
      setResult(await fetchArtistEssentials(name, controller.signal, choice));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setFailure(toFailure(err, 'Something went wrong. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setArtist = useCallback((name: string): void => {
    setArtistText(name);
    setChosen(null);
  }, []);

  const chooseArtist = useCallback(
    (pick: ChosenArtist): Promise<void> => {
      setArtistText(pick.name);
      setChosen(pick);
      return lookUp(pick.name, pick);
    },
    [lookUp],
  );

  const fetchEssentials = useCallback(
    (): Promise<void> => lookUp(artist.trim(), chosen),
    [lookUp, artist, chosen],
  );

  const clear = useCallback((): void => {
    abortControllerRef.current?.abort();
    setArtistText('');
    setChosen(null);
    setResult(null);
    setFailure(null);
    setIsLoading(false);
  }, []);

  return {
    artist,
    setArtist,
    chosen,
    chooseArtist,
    result,
    isLoading,
    error,
    isLimitReached,
    fetchEssentials,
    clear,
  };
}
