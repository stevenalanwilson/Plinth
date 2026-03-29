import React from 'react';

interface ServiceLinksProps {
  appleMusicDirectUrl: string | null;
  appleMusicSearchUrl: string;
  spotifyUrl: string;
  discogsUrl: string;
  compact?: boolean;
}

function AppleMusicOpenIcon(): React.ReactElement {
  // External-link arrow — signals "opens directly"
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 2H2.5a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V7" />
      <path d="M7.5 2H10v2.5" />
      <line x1="10" y1="2" x2="5.5" y2="6.5" />
    </svg>
  );
}

function AppleMusicSearchIcon(): React.ReactElement {
  // Single eighth-note — universally recognisable as music
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <path d="M9 1.5v5.3a2 2 0 1 1-1.5-.8V3.5L5 4.2V8a2 2 0 1 1-1.5-.8V3l5.5-1.5z" />
    </svg>
  );
}

function SpotifyIcon(): React.ReactElement {
  // Three curved arcs — Spotify's logo shape
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M2 4.5c2.2-.9 5.5-.7 8 1" />
      <path d="M2.5 6.5c1.8-.7 4.5-.5 6.5.8" />
      <path d="M3 8.5c1.4-.5 3.5-.4 5 .5" />
    </svg>
  );
}

function DiscogsIcon(): React.ReactElement {
  // Vinyl record — outer groove ring + label ring + spindle hole
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="6" cy="6" r="4.5" />
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="6" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
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
    <div
      className={compact ? undefined : 'service-links'}
      style={
        compact ? { display: 'flex', flexDirection: 'column', gap: 6, width: '100%' } : undefined
      }
    >
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
