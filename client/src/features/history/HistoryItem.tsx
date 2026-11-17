import React, { useState } from 'react';
import { HistoryEntry } from '../../types/history';
import {
  getProxiedArtworkUrl,
  buildAppleMusicSearchUrl,
  buildSpotifySearchUrl,
  buildDiscogsSearchUrl,
} from '../../services/apiClient';
import { isRated } from '../../services/libraryRetention';
import { ServiceLinks } from '../../components/ServiceLinks';
import { PlaceholderSleeve } from '../../components/PlaceholderSleeve';
import { ConfirmButton } from '../../components/ConfirmButton';
import { FeedbackBadge } from '../feedback/FeedbackBadge';
import { FEEDBACK_LABELS } from '../feedback/feedbackLabels';

interface HistoryItemProps {
  entry: HistoryEntry;
  onRemove: (id: string) => void;
  onSelect: (id: string) => void;
}

export function HistoryItem({ entry, onRemove, onSelect }: HistoryItemProps): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [imgErrored, setImgErrored] = useState(false);
  const status = entry.feedback?.status ?? null;
  const isOverlayShown = isHovered || isActionsOpen;
  const cardName = `${entry.recommendation.album} by ${entry.recommendation.artist}`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Load ${cardName}${status ? `, marked ${FEEDBACK_LABELS[status]}` : ''}`}
      // A finger "enters" a card only for the length of a tap, so only a mouse or pen hovers.
      onPointerEnter={(e) => setIsHovered(e.pointerType !== 'touch')}
      onPointerLeave={() => setIsHovered(false)}
      onClick={() => onSelect(entry.id)}
      onKeyDown={(e) => {
        // Keys pressed on the controls inside the card are theirs, not a request to open the album.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(entry.id);
        }
      }}
      style={{
        display: 'block',
        background: 'var(--surface)',
        border: `1px solid ${isHovered ? 'var(--border2)' : 'var(--border)'}`,
        borderRadius: 10,
        overflow: 'hidden',
        cursor: 'pointer',
        transform: isHovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'transform 0.2s, border-color 0.2s',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1',
          background: 'var(--surface2)',
          overflow: 'hidden',
        }}
      >
        {entry.artworkResponse.artworkUrl && !imgErrored ? (
          <img
            src={getProxiedArtworkUrl(entry.artworkResponse.artworkUrl)}
            alt={entry.recommendation.album}
            loading="lazy"
            onError={() => setImgErrored(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <PlaceholderSleeve
            artist={entry.recommendation.artist}
            album={entry.recommendation.album}
            compact
          />
        )}

        <FeedbackBadge status={status} />

        <div
          className="history-overlay"
          onClick={(e) => {
            e.stopPropagation();
            // A tap on the panel itself, not on a link or Remove, puts it away.
            if (e.target === e.currentTarget) setIsActionsOpen(false);
          }}
          style={{
            opacity: isOverlayShown ? 1 : 0,
            pointerEvents: isOverlayShown ? 'auto' : 'none',
          }}
        >
          <ServiceLinks
            appleMusicDirectUrl={entry.artworkResponse.appleMusicUrl}
            appleMusicSearchUrl={buildAppleMusicSearchUrl(
              entry.recommendation.artist,
              entry.recommendation.album,
            )}
            spotifyUrl={buildSpotifySearchUrl(
              entry.recommendation.artist,
              entry.recommendation.album,
            )}
            discogsUrl={buildDiscogsSearchUrl(
              entry.recommendation.artist,
              entry.recommendation.album,
            )}
            compact
          />
          {/* An album the listener rated is their crate, so removing one asks first. */}
          <ConfirmButton
            label="Remove"
            confirmLabel="Tap again to remove"
            requireConfirm={isRated(entry)}
            onConfirm={() => onRemove(entry.id)}
            className="history-remove"
          />
        </div>

        {/* Hover isn't there on a phone, so the panel opens from here; CSS shows this only without hover. */}
        <button
          type="button"
          className="history-actions-toggle"
          aria-expanded={isActionsOpen}
          aria-label={`${isActionsOpen ? 'Hide' : 'Show'} options for ${cardName}`}
          onClick={(e) => {
            e.stopPropagation();
            setIsActionsOpen((open) => !open);
          }}
        >
          <span aria-hidden="true">{isActionsOpen ? '×' : '⋯'}</span>
        </button>
      </div>

      <div style={{ padding: '10px 12px 12px' }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--text)',
            marginBottom: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.recommendation.album}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.recommendation.artist}
        </div>
        <div style={{ fontSize: 10, color: 'var(--accent2)', marginTop: 4 }}>
          {entry.recommendation.year}
        </div>
      </div>
    </div>
  );
}
