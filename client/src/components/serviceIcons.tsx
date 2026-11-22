import React from 'react';

interface IconProps {
  readonly size?: number;
}

export function AppleMusicOpenIcon({ size = 12 }: IconProps): React.ReactElement {
  // External-link arrow — signals "opens directly"
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
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

export function AppleMusicSearchIcon({ size = 12 }: IconProps): React.ReactElement {
  // Single eighth-note — universally recognisable as music
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 12 12" fill="currentColor">
      <path d="M9 1.5v5.3a2 2 0 1 1-1.5-.8V3.5L5 4.2V8a2 2 0 1 1-1.5-.8V3l5.5-1.5z" />
    </svg>
  );
}

export function SpotifyIcon({ size = 12 }: IconProps): React.ReactElement {
  // Three curved arcs — Spotify's logo shape
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
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

export function DiscogsIcon({ size = 12 }: IconProps): React.ReactElement {
  // Vinyl record — outer groove ring + label ring + spindle hole
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
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
