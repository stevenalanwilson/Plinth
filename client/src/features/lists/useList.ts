import { useCallback, useEffect, useState } from 'react';
import { ListResponse } from '@shared/types';
import { ApiError, fetchList } from '../../services/apiClient';

export type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly list: ListResponse }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly message: string };

const LOADING: ListState = { status: 'loading' };

/** The list with this code, as the person looking at it may see it. */
export function useList(id: string): { readonly state: ListState; readonly retry: () => void } {
  const [state, setState] = useState<ListState>(LOADING);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState(LOADING);

    fetchList(id, controller.signal)
      .then((list) => {
        // A response for a list we've since left must not replace the current one.
        if (!controller.signal.aborted) setState({ status: 'ready', list });
      })
      .catch((error: unknown) => {
        // Leaving the page or changing list cancels the request; that isn't a failure.
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
  }, [id, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  return { state, retry };
}
