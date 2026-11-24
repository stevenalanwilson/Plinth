import { useCallback, useEffect, useState } from 'react';
import { ListResponse } from '@shared/types';
import { fetchOwnLists } from '../../services/apiClient';

export type OwnListsStatus = 'loading' | 'ready' | 'failed';

export interface OwnLists {
  readonly status: OwnListsStatus;
  readonly lists: readonly ListResponse[];
  /** Tries again after the lists couldn't be loaded. */
  readonly reload: () => void;
}

/** The lists the person has made, for choosing which one to open. */
export function useOwnLists(): OwnLists {
  const [status, setStatus] = useState<OwnListsStatus>('loading');
  const [lists, setLists] = useState<readonly ListResponse[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    fetchOwnLists(controller.signal)
      .then((response) => {
        setLists(response.lists);
        setStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('failed');
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  return { status, lists, reload };
}
