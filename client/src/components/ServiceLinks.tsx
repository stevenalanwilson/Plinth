import React from 'react';

interface ServiceLinksProps {
  appleMusicDirectUrl: string | null;
  appleMusicSearchUrl: string;
  spotifyDirectUrl: string | null;
  spotifySearchUrl: string;
  compact?: boolean;
}

export function ServiceLinks({
  appleMusicDirectUrl,
  appleMusicSearchUrl,
  spotifyDirectUrl,
  spotifySearchUrl,
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
  const appleMusicOpacity = appleMusicDirectUrl ? 1 : 0.55;

  const spotifyUrl = spotifyDirectUrl ?? spotifySearchUrl;
  const spotifyLabel = spotifyDirectUrl ? 'Open in Spotify' : 'Search in Spotify';
  const spotifyOpacity = spotifyDirectUrl ? 1 : 0.55;

  const appleMusicStyle: React.CSSProperties = {
    ...baseLinkStyle,
    color: 'var(--text)',
    border: '1px solid var(--border2)',
    opacity: appleMusicOpacity,
  };

  const spotifyStyle: React.CSSProperties = {
    ...baseLinkStyle,
    color: compact ? 'var(--text)' : 'var(--muted)',
    border: `1px solid ${compact ? 'var(--border2)' : 'var(--border)'}`,
    opacity: spotifyOpacity,
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
        className="service-link"
        style={appleMusicStyle}
      >
        {!compact && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="5" cy="5" r="3.5" />
            <line x1="8" y1="8" x2="11" y2="11" />
          </svg>
        )}
        {compact ? 'Apple Music' : appleMusicLabel}
      </a>
      <a
        href={spotifyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="service-link"
        style={spotifyStyle}
      >
        {!compact && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="6" cy="6" r="5" />
            <path
              d="M3.5 4.5c1.5-.5 3.5-.5 5 .5M3 6.5c1.3-.4 3.2-.4 4.5.5M3.5 8.5c1-.3 2.5-.3 3.5.3"
              strokeLinecap="round"
            />
          </svg>
        )}
        {spotifyLabel}
      </a>
    </div>
  );
}
