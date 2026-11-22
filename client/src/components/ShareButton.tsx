import React from 'react';
import { useShare } from '../hooks/useShare';

interface ShareButtonProps {
  readonly slug: string;
  readonly album: string;
  readonly artist: string;
  readonly hook: string | null;
}

function ShareIcon(): React.ReactElement {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

/**
 * A square icon button that shares the album's page: the phone's share sheet where there is one,
 * otherwise a copied link. Named for screen readers and as a tooltip, since it shows no text.
 */
export function ShareButton({ slug, album, artist, hook }: ShareButtonProps): React.ReactElement {
  const { status, share } = useShare();
  const title = `${album} by ${artist}`;
  const copied = status === 'copied';

  return (
    <>
      <button
        type="button"
        className="icon-action"
        data-copied={copied}
        aria-label={copied ? 'Link copied' : 'Share'}
        title="Share"
        onClick={() =>
          void share({
            title,
            text: hook ?? `${title}, a record picked on Plinth.`,
            url: `${window.location.origin}/album/${encodeURIComponent(slug)}`,
          })
        }
      >
        <ShareIcon />
      </button>
      <span role="status" className="visually-hidden">
        {copied ? 'Link copied' : ''}
      </span>
    </>
  );
}
