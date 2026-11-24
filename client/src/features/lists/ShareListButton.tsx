import React from 'react';
import { ShareIcon } from '../../components/ShareButton';
import { useShare } from '../../hooks/useShare';
import { noteListShared } from '../../services/apiClient';
import { describeAlbums } from './listText';

interface ShareListButtonProps {
  readonly list: {
    readonly id: string;
    readonly title: string;
    readonly albums: readonly { readonly album: string; readonly artist: string }[];
  };
  /** A square icon button, as on an album page; or a button with a label of its own. */
  readonly variant: 'icon' | 'text';
  /** What a button with a label says. */
  readonly label?: string;
  /** Called as the list is shared, so the page can offer what comes next. */
  readonly onShare?: () => void;
  readonly disabled?: boolean;
}

/**
 * Shares a list's page: the phone's share sheet where there is one, otherwise a copied link. The
 * server is told, and asked to draw the list's picture, so it is ready by the time a platform
 * comes for it. Neither is waited for and neither can stop the sharing.
 */
export function ShareListButton({
  list,
  variant,
  label = 'Share',
  onShare,
  disabled = false,
}: ShareListButtonProps): React.ReactElement {
  const { status, share } = useShare();
  const copied = status === 'copied';

  function handleClick(): void {
    try {
      noteListShared(list.id);
    } catch {
      // Counting shares and drawing the picture in advance are extras: sharing goes ahead.
    }
    onShare?.();
    void share({
      title: list.title,
      text: describeAlbums(list.albums),
      url: `${window.location.origin}/list/${encodeURIComponent(list.id)}`,
    });
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          className="icon-action"
          data-copied={copied}
          aria-label={copied ? 'Link copied' : 'Share'}
          title="Share"
          disabled={disabled}
          onClick={handleClick}
        >
          <ShareIcon />
        </button>
      ) : (
        <button
          type="button"
          className="app-cta-button share-list-button"
          data-copied={copied}
          disabled={disabled}
          onClick={handleClick}
        >
          <ShareIcon />
          {copied ? 'Link copied' : label}
        </button>
      )}
      <span role="status" className="visually-hidden">
        {copied ? 'Link copied' : ''}
      </span>
    </>
  );
}
