import React, { useState } from 'react';
import { getProxiedArtworkUrl } from '../../services/apiClient';
import { PlaceholderSleeve } from '../../components/PlaceholderSleeve';

/** The album's front cover from the Cover Art Archive, which may not have one. */
export function coverArtUrl(releaseGroupId: string): string {
  return `https://coverartarchive.org/release-group/${encodeURIComponent(releaseGroupId)}/front-250`;
}

interface EssentialCoverProps {
  readonly artist: string;
  readonly album: string;
  /** Absent for a list that couldn't be checked, which then gets the placeholder. */
  readonly releaseGroupId?: string;
}

/** The album's cover, or the placeholder sleeve when the Cover Art Archive has none. */
export function EssentialCover({
  artist,
  album,
  releaseGroupId,
}: EssentialCoverProps): React.ReactElement {
  const [failed, setFailed] = useState(false);

  if (!releaseGroupId || failed) {
    return <PlaceholderSleeve artist={artist} album={album} compact />;
  }
  return (
    <img
      src={getProxiedArtworkUrl(coverArtUrl(releaseGroupId))}
      alt={`${album} album artwork`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
