import React from 'react';
import { AlbumCover } from '../../components/AlbumCover';
import { PickedAlbum } from './topThree';

interface TopThreeSlotProps {
  /** 1 for the best album. */
  readonly rank: number;
  /** The album in this slot; null for a slot still to be filled. */
  readonly album: PickedAlbum | null;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onRemove: () => void;
  readonly onDragStart: () => void;
  readonly onDrop: () => void;
}

function Chevron({ direction }: { readonly direction: 'up' | 'down' }): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === 'up' ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  );
}

function CrossIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/**
 * One place in the top 3: the album in it, with buttons to move or remove it, or an empty place.
 * Albums can be dragged by mouse; the buttons are how a keyboard or a phone does the same.
 */
export function TopThreeSlot({
  rank,
  album,
  canMoveUp,
  canMoveDown,
  onMove,
  onRemove,
  onDragStart,
  onDrop,
}: TopThreeSlotProps): React.ReactElement {
  if (!album) {
    return (
      <li className="top-three-slot" data-empty="true">
        <span className="top-three-rank">{rank}</span>
        <span className="top-three-empty">Add an album</span>
      </li>
    );
  }

  const detail = [album.artist, album.year].filter(Boolean).join(' · ');
  return (
    <li
      className="top-three-slot"
      data-album-id={album.releaseGroupId}
      draggable
      onDragStart={(event) => {
        // Some browsers won't start a drag without data to carry.
        event.dataTransfer.setData('text/plain', album.releaseGroupId);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <span className="top-three-rank">{rank}</span>
      <div className="top-three-cover">
        <AlbumCover
          artist={album.artist}
          album={album.album}
          releaseGroupId={album.releaseGroupId}
        />
      </div>
      <div className="top-three-details">
        <span className="top-three-title">{album.album}</span>
        <span className="top-three-meta">{detail}</span>
      </div>
      <div className="top-three-controls">
        <button
          type="button"
          className="icon-action"
          data-control="up"
          aria-label={`Move ${album.album} up`}
          title="Move up"
          disabled={!canMoveUp}
          onClick={() => onMove(-1)}
        >
          <Chevron direction="up" />
        </button>
        <button
          type="button"
          className="icon-action"
          data-control="down"
          aria-label={`Move ${album.album} down`}
          title="Move down"
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
        >
          <Chevron direction="down" />
        </button>
        <button
          type="button"
          className="icon-action"
          data-control="remove"
          aria-label={`Remove ${album.album}`}
          title="Remove"
          onClick={onRemove}
        >
          <CrossIcon />
        </button>
      </div>
    </li>
  );
}
