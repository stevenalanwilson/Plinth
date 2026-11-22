import React from 'react';
import { AppleMusicOpenIcon, AppleMusicSearchIcon, DiscogsIcon, SpotifyIcon } from './serviceIcons';

interface ServiceLinksProps {
  appleMusicDirectUrl: string | null;
  appleMusicSearchUrl: string;
  spotifyUrl: string;
  discogsUrl: string;
  compact?: boolean;
}

export function ServiceLinks({
  appleMusicDirectUrl,
  appleMusicSearchUrl,
  spotifyUrl,
  discogsUrl,
  compact = false,
}: ServiceLinksProps): React.ReactElement {
  const baseLinkStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: compact ? 10 : 12,
    textDecoration: 'none',
    borderRadius: 6,
    padding: compact ? '5px 10px' : '11px 16px',
    width: compact ? '100%' : undefined,
    justifyContent: 'center',
    letterSpacing: compact ? '0.04em' : undefined,
  };

  const appleMusicUrl = appleMusicDirectUrl ?? appleMusicSearchUrl;
  const appleMusicLabel = appleMusicDirectUrl ? 'Open in Apple Music' : 'Search in Apple Music';
  const isPrimary = appleMusicDirectUrl !== null;

  const appleMusicStyle: React.CSSProperties = {
    ...baseLinkStyle,
    color: isPrimary ? 'var(--accent)' : 'var(--muted)',
    border: `1px solid ${isPrimary ? 'var(--accent)' : 'var(--border2)'}`,
  };

  const secondaryStyle: React.CSSProperties = {
    ...baseLinkStyle,
    color: 'var(--muted)',
    border: '1px solid var(--border2)',
  };

  return (
    <div className={compact ? 'service-links-compact' : 'service-links'}>
      <a
        href={appleMusicUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`service-link${isPrimary ? ' service-link-primary' : ''}`}
        style={appleMusicStyle}
      >
        {!compact && (isPrimary ? <AppleMusicOpenIcon /> : <AppleMusicSearchIcon />)}
        {compact ? 'Apple Music' : appleMusicLabel}
      </a>
      <a
        href={spotifyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="service-link"
        style={secondaryStyle}
      >
        {!compact && <SpotifyIcon />}
        {compact ? 'Spotify' : 'Search in Spotify'}
      </a>
      <a
        href={discogsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="service-link"
        style={secondaryStyle}
      >
        {!compact && <DiscogsIcon />}
        {compact ? 'Discogs' : 'Search in Discogs'}
      </a>
    </div>
  );
}
