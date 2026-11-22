import { useEffect, useState } from 'react';
import { fetchArtwork, getProxiedArtworkUrl } from '../../services/apiClient';

/**
 * The real cover for the demo's record, found the same way as a pick's, so the demo never shows
 * a cover the site wouldn't. Null while it's being found, and for good if there's no confident
 * match or the lookup fails, in which case the placeholder sleeve stands in.
 */
export function useDemoArtwork(artist: string, album: string, isWanted: boolean): string | null {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isWanted) return;
    let isCurrent = true;

    fetchArtwork(artist, album)
      .then(({ artworkUrl }) => {
        if (!isCurrent || !artworkUrl) return;
        const proxied = getProxiedArtworkUrl(artworkUrl);
        // Loaded ahead of time, so the cover is ready the moment the record turns up.
        new Image().src = proxied;
        setCoverUrl(proxied);
      })
      .catch(() => {
        // Nothing to do: the placeholder sleeve stays.
      });

    return () => {
      isCurrent = false;
    };
  }, [artist, album, isWanted]);

  return coverUrl;
}
