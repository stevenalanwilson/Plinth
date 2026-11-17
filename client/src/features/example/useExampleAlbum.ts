import { useEffect, useState } from 'react';
import { AlbumResponse } from '@shared/types';
import { fetchExampleAlbum } from '../../services/apiClient';

/**
 * A real album to show someone who hasn't had a pick yet. Null while it loads, and for good if
 * there's none to show or the request fails, since the plain empty state is a fine fallback.
 */
export function useExampleAlbum(): AlbumResponse | null {
  const [album, setAlbum] = useState<AlbumResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchExampleAlbum(controller.signal)
      .then((example) => {
        if (!controller.signal.aborted) setAlbum(example);
      })
      .catch(() => {
        // Nothing to do: the empty state stays as it is.
      });

    return () => controller.abort();
  }, []);

  return album;
}
