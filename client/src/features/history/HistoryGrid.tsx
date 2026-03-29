import React, { useState } from 'react';
import { HistoryEntry } from '../../types/history';
import {
  getProxiedArtworkUrl,
  buildAppleMusicSearchUrl,
  buildSpotifySearchUrl,
} from '../../services/apiClient';
import { ServiceLinks } from '../../components/ServiceLinks';

const VISIBLE_COUNT = 9;

interface HistoryGridProps {
  history: HistoryEntry[];
  onClear: () => void;
  onRemove: (id: string) => void;
}

interface HistoryItemProps {
  entry: HistoryEntry;
  onRemove: (id: string) => void;
}

function HistoryItem({ entry, onRemove }: HistoryItemProps): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const [imgErrored, setImgErrored] = useState(false);

  return (
    <div
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      style={{
        display: 'block',
        background: 'var(--surface)',
        border: `1px solid ${isHovered ? 'var(--border2)' : 'var(--border)'}`,
        borderRadius: 10,
        overflow: 'hidden',
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
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--serif)',
              fontSize: 28,
              color: 'var(--muted)',
            }}
          >
            ♪
          </div>
        )}

        <div
          className="history-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(14,14,15,0.82)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 0.2s',
            padding: '0 12px',
          }}
        >
          <ServiceLinks
            appleMusicDirectUrl={entry.artworkResponse.appleMusicUrl}
            appleMusicSearchUrl={buildAppleMusicSearchUrl(
              entry.recommendation.artist,
              entry.recommendation.album,
            )}
            spotifyDirectUrl={entry.artworkResponse.spotifyUrl}
            spotifySearchUrl={buildSpotifySearchUrl(
              entry.recommendation.artist,
              entry.recommendation.album,
            )}
            compact
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(entry.id);
            }}
            style={{
              marginTop: 2,
              fontSize: 10,
              color: 'var(--muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontFamily: 'var(--mono)',
              padding: '2px 8px',
            }}
          >
            Remove
          </button>
        </div>
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

export function HistoryGrid({ history, onClear, onRemove }: HistoryGridProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);

  const visible = isExpanded ? history : history.slice(0, VISIBLE_COUNT);
  const hiddenCount = history.length - VISIBLE_COUNT;

  return (
    <section>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <h3
          style={{
            fontSize: 11,
            color: 'var(--muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Previously suggested
        </h3>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear history"
          style={{
            fontSize: 11,
            color: 'var(--muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '4px 10px',
            fontFamily: 'var(--mono)',
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </div>
      <div className="history-grid">
        {visible.map((entry) => (
          <HistoryItem key={entry.id} entry={entry} onRemove={onRemove} />
        ))}
      </div>
      {hiddenCount > 0 && !isExpanded && (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '10px',
            fontSize: 11,
            color: 'var(--muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontFamily: 'var(--mono)',
            cursor: 'pointer',
          }}
        >
          Show {hiddenCount} more
        </button>
      )}
      {isExpanded && history.length > VISIBLE_COUNT && (
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '10px',
            fontSize: 11,
            color: 'var(--muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontFamily: 'var(--mono)',
            cursor: 'pointer',
          }}
        >
          Show less
        </button>
      )}
    </section>
  );
}
