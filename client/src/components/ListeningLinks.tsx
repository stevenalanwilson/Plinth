import React from 'react';
import {
  buildAppleMusicSearchUrl,
  buildDiscogsSearchUrl,
  buildSpotifySearchUrl,
} from '../services/apiClient';

interface ListeningLinksProps {
  readonly artist: string;
  readonly album: string;
  /** A link straight to the album in Apple Music, when one is known; otherwise a search. */
  readonly appleMusicUrl?: string | null;
}

/** A row of small links for finding an album: Apple Music and Spotify to hear it, Discogs to buy it. */
export function ListeningLinks({
  artist,
  album,
  appleMusicUrl,
}: ListeningLinksProps): React.ReactElement {
  return (
    <div className="essentials-links">
      <a
        href={appleMusicUrl || buildAppleMusicSearchUrl(artist, album)}
        target="_blank"
        rel="noopener noreferrer"
        className="essentials-link"
      >
        Apple Music
      </a>
      <a
        href={buildSpotifySearchUrl(artist, album)}
        target="_blank"
        rel="noopener noreferrer"
        className="essentials-link"
      >
        Spotify
      </a>
      <a
        href={buildDiscogsSearchUrl(artist, album)}
        target="_blank"
        rel="noopener noreferrer"
        className="essentials-link"
      >
        Discogs
      </a>
    </div>
  );
}
