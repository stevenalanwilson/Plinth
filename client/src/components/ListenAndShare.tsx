import React from 'react';
import { ServiceIconLinks } from './ServiceIconLinks';
import { ShareButton } from './ShareButton';

interface ListenAndShareProps {
  readonly artist: string;
  readonly album: string;
  /** A link straight to the album in Apple Music, when one is known; otherwise a search. */
  readonly appleMusicUrl: string | null;
  /** The album's own page. Without one there's nothing to share, so the Share button is left out. */
  readonly slug?: string | null;
  readonly hook: string | null;
}

/** The square icon buttons for an album: where to hear or buy it, and a way to share it. */
export function ListenAndShare({
  artist,
  album,
  appleMusicUrl,
  slug,
  hook,
}: ListenAndShareProps): React.ReactElement {
  return (
    <div className="icon-actions" role="group" aria-label="Listen and share">
      <ServiceIconLinks artist={artist} album={album} appleMusicUrl={appleMusicUrl} />
      {slug && (
        <>
          <span className="icon-actions-divider" aria-hidden="true" />
          <ShareButton slug={slug} album={album} artist={artist} hook={hook} />
        </>
      )}
    </div>
  );
}
