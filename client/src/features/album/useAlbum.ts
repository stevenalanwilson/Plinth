import { useCallback, useEffect, useState } from 'react';
import { AlbumResponse } from '@shared/types';
import { ApiError, fetchAlbum } from '../../services/apiClient';

export type AlbumState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly album: AlbumResponse }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly message: string };

interface UseAlbumReturn {
  readonly state: AlbumState;
  readonly retry: () => void;
}

const LOADING: AlbumState = { status: 'loading' };

export function useAlbum(slug: string): UseAlbumReturn {
  const [state, setState] = useState<AlbumState>(LOADING);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState(LOADING);

    fetchAlbum(slug, controller.signal)
      .then((album) => {
        // A response for a slug we've since left must not replace the current one.
        if (!controller.signal.aborted) setState({ status: 'ready', album });
      })
      .catch((error: unknown) => {
        // Leaving the page or changing slug cancels the request; that isn't a failure.
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 404) {
          setState({ status: 'not-found' });
          return;
        }
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
