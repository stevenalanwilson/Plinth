import React from 'react';
import { RecommendationResponse, ArtworkResponse } from '@shared/types';
import { getProxiedArtworkUrl, buildAppleMusicSearchUrl } from '../../services/apiClient';

interface RecommendationCardProps {
  recommendation: RecommendationResponse | null;
  artworkResponse: ArtworkResponse | null;
  isLoading: boolean;
  error: string | null;
}

export function RecommendationCard({
  recommendation,
  artworkResponse,
  isLoading,
  error,
}: RecommendationCardProps): React.ReactElement {
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 48, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 48 }}>
        <div style={{ width: 24, height: 24, border: '2px solid var(--border2)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
        <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Finding your next favourite…
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '48px 28px', textAlign: 'center', marginBottom: 48 }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 36, color: 'var(--danger)', marginBottom: 12 }}>!</div>
        <p style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</p>
      </div>
    );
  }

  if (!recommendation) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '48px 28px', textAlign: 'center', color: 'var(--muted)', marginBottom: 48 }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 36, color: 'var(--accent)', marginBottom: 12 }}>♪</div>
        <p style={{ fontSize: 13, lineHeight: 1.6 }}>Your next favourite album is waiting.<br />Upload your library and hit the button.</p>
      </div>
    );
  }

  const year = recommendation.year || artworkResponse?.year || '—';
  const appleMusicUrl =
    artworkResponse?.appleMusicUrl ??
    buildAppleMusicSearchUrl(recommendation.artist, recommendation.album);
  const appleMusicLabel = artworkResponse?.appleMusicUrl ? 'Open in Apple Music' : 'Search in Apple Music';

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', animation: 'fadeUp 0.4s ease both', marginBottom: 48 }}>
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{ display: 'flex', gap: 24, padding: 28 }}>
        <div style={{ width: 140, height: 140, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          {artworkResponse?.artworkUrl ? (
            <img src={getProxiedArtworkUrl(artworkResponse.artworkUrl)} alt={`${recommendation.album} album artwork`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 40, fontFamily: 'var(--serif)' }}>♪</div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 400, lineHeight: 1.2, marginBottom: 8 }}>
            {recommendation.album}
          </div>
          <div style={{ fontSize: 14, color: 'var(--accent)', marginBottom: 6, letterSpacing: '0.02em' }}>
            {recommendation.artist}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20, letterSpacing: '0.06em' }}>
            {year}
          </div>
          <a
            href={appleMusicUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', width: 'fit-content' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="5" cy="5" r="3.5" />
              <line x1="8" y1="8" x2="11" y2="11" />
            </svg>
            {appleMusicLabel}
          </a>
        </div>
      </div>
      <div style={{ padding: '20px 28px 24px', borderTop: '1px solid var(--border)', fontSize: 15, color: 'var(--muted)', lineHeight: 1.7, fontStyle: 'italic', fontFamily: 'var(--serif)' }}>
        {recommendation.reason}
      </div>
    </div>
  );
}
