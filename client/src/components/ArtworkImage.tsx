import React, { useState } from 'react';
import { getProxiedArtworkUrl } from '../services/apiClient';
import { PlaceholderSleeve } from './PlaceholderSleeve';

interface ArtworkImageProps {
  readonly artist: string;
  readonly album: string;
  /** The cover the server found; null when it found none. */
  readonly artworkUrl: string | null;
}

/** The album's cover, or the placeholder sleeve when there is none or it can't be loaded. */
export function ArtworkImage({ artist, album, artworkUrl }: ArtworkImageProps): React.ReactElement {
  const [hasFailed, setHasFailed] = useState(false);

  if (!artworkUrl || hasFailed) return <PlaceholderSleeve artist={artist} album={album} />;
  return (
    <img
      src={getProxiedArtworkUrl(artworkUrl)}
      alt={`${album} album artwork`}
      onError={() => setHasFailed(true)}
    />
  );
}
