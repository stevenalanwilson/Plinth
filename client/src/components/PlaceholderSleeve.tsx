import React from 'react';

interface PlaceholderSleeveProps {
  readonly artist: string;
  readonly album: string;
  readonly compact?: boolean;
}

/** A stable hue per album, so the same album always gets the same sleeve. */
export function sleeveHue(key: string): number {
  let hash = 0;
  for (const character of key) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash % 360;
}

/** Stands in for artwork when there's no confident cover, so a wrong image is never shown. */
export function PlaceholderSleeve({
  artist,
  album,
  compact = false,
}: PlaceholderSleeveProps): React.ReactElement {
  const hue = sleeveHue(`${artist} – ${album}`);

  return (
    <div
      role="img"
      aria-label={`${album} by ${artist}, no artwork available`}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 8,
        padding: compact ? 10 : 16,
        background: `linear-gradient(145deg, hsl(${hue} 30% 26%), hsl(${(hue + 40) % 360} 26% 13%))`,
        color: `hsl(${hue} 30% 88%)`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontSize: compact ? 15 : 22,
          lineHeight: 1.15,
          overflowWrap: 'anywhere',
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {album}
      </div>
      <div
        style={{
          fontSize: compact ? 9 : 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: 0.75,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {artist}
      </div>
    </div>
  );
}
