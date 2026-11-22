import React from 'react';
import {
  buildAppleMusicSearchUrl,
  buildDiscogsSearchUrl,
  buildSpotifySearchUrl,
} from '../services/apiClient';
import { AppleMusicIcon, DiscogsIcon, SpotifyIcon } from './serviceIcons';

interface ServiceIconLinksProps {
  readonly artist: string;
  readonly album: string;
  /** A link straight to the album in Apple Music, when one is known; otherwise a search. */
  readonly appleMusicUrl: string | null;
}

interface IconLinkProps {
  readonly href: string;
  readonly label: string;
  readonly isDirect?: boolean;
  readonly children: React.ReactNode;
}

function IconLink({ href, label, isDirect = false, children }: IconLinkProps): React.ReactElement {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="icon-action"
      data-direct={isDirect}
      aria-label={label}
      title={label}
    >
      {children}
    </a>
  );
}

/**
 * Square icon links to find an album: Apple Music and Spotify to hear it, Discogs to buy it.
 * Apple Music is picked out in gold when it goes straight to the album rather than a search.
 */
export function ServiceIconLinks({
  artist,
  album,
  appleMusicUrl,
}: ServiceIconLinksProps): React.ReactElement {
  const isDirect = appleMusicUrl !== null;

  return (
    <>
      <IconLink
        href={appleMusicUrl ?? buildAppleMusicSearchUrl(artist, album)}
        label={isDirect ? 'Open in Apple Music' : 'Search in Apple Music'}
        isDirect={isDirect}
      >
        <AppleMusicIcon size={16} />
      </IconLink>
      <IconLink href={buildSpotifySearchUrl(artist, album)} label="Search in Spotify">
        <SpotifyIcon size={16} />
      </IconLink>
      <IconLink href={buildDiscogsSearchUrl(artist, album)} label="Search in Discogs">
        <DiscogsIcon size={16} />
      </IconLink>
    </>
  );
}
