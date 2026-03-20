import React from 'react';
import { HistoryEntry } from '../../types/history';
import { getProxiedArtworkUrl } from '../../services/apiClient';

interface HistoryGridProps {
  history: HistoryEntry[];
}

export function HistoryGrid({ history }: HistoryGridProps): React.ReactElement {
  return (
    <section>
      <h3 style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
        Previously suggested
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
        {history.map((entry) => (
          <div
            key={`${entry.recommendation.artist}-${entry.recommendation.album}`}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}
          >
            <div style={{ width: '100%', aspectRatio: '1', background: 'var(--surface2)', overflow: 'hidden' }}>
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
          </div>
        ))}
      </div>
    </section>
  );
}
