import React, { useState } from 'react';
import { HistoryEntry } from '../../types/history';
import { getProxiedArtworkUrl, buildAppleMusicSearchUrl } from '../../services/apiClient';

interface HistoryGridProps {
  history: HistoryEntry[];
}

interface HistoryItemProps {
  entry: HistoryEntry;
}

function HistoryItem({ entry }: HistoryItemProps): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);

  const appleMusicUrl =
    entry.artworkResponse.appleMusicUrl ??
    buildAppleMusicSearchUrl(entry.recommendation.artist, entry.recommendation.album);

  return (
    <a
      href={appleMusicUrl}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'block',
        textDecoration: 'none',
        background: 'var(--surface)',
        border: `1px solid ${isHovered ? 'var(--border2)' : 'var(--border)'}`,
        borderRadius: 10,
        overflow: 'hidden',
        transform: isHovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'transform 0.2s, border-color 0.2s',
      }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '1', background: 'var(--surface2)', overflow: 'hidden' }}>
        {entry.artworkResponse.artworkUrl ? (
          <img
            src={getProxiedArtworkUrl(entry.artworkResponse.artworkUrl)}
            alt={entry.recommendation.album}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--muted)' }}>♪</div>
        )}

        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(14,14,15,0.75)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.2s',
        }}>
          <span style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--accent)' }}>♪</span>
          <span style={{ fontSize: 10, color: 'var(--text)', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center', padding: '0 8px' }}>
            Open in Apple Music
          </span>
        </div>
      </div>

      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.recommendation.album}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.recommendation.artist}
        </div>
        <div style={{ fontSize: 10, color: 'var(--accent2)', marginTop: 4 }}>
          {entry.recommendation.year}
        </div>
      </div>
    </a>
  );
}

export function HistoryGrid({ history }: HistoryGridProps): React.ReactElement {
  return (
    <section>
      <h3 style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
        Previously suggested
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
        {history.map((entry) => (
          <HistoryItem
            key={entry.id}
            entry={entry}
          />
        ))}
      </div>
    </section>
  );
}
