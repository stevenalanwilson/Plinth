import { useCallback, useEffect, useState } from 'react';
import { AlbumDetailsResponse } from '@shared/types';
import { fetchAlbumDetails } from '../../services/apiClient';

export type AlbumDetailsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly details: AlbumDetailsResponse }
  | { readonly status: 'error'; readonly message: string };

interface UseAlbumDetailsReturn {
  readonly state: AlbumDetailsState;
  readonly retry: () => void;
}

const LOADING: AlbumDetailsState = { status: 'loading' };

export function useAlbumDetails(slug: string): UseAlbumDetailsReturn {
  const [state, setState] = useState<AlbumDetailsState>(LOADING);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState(LOADING);

    fetchAlbumDetails(slug, controller.signal)
      .then((details) => {
        // A response for a slug we've since left must not replace the current one.
        if (!controller.signal.aborted) setState({ status: 'ready', details });
      })
      .catch((error: unknown) => {
        // Leaving the page or changing slug cancels the request; that isn't a failure.
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Something went wrong.',
        });
      });

    return () => controller.abort();
  }, [slug, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  return { state, retry };
}
