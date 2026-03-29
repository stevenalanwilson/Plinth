import React, { useState } from 'react';
import { RecommendationResponse, ArtworkResponse } from '@shared/types';
import {
  getProxiedArtworkUrl,
  buildAppleMusicSearchUrl,
  buildSpotifySearchUrl,
} from '../../services/apiClient';
import { ServiceLinks } from '../../components/ServiceLinks';

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
  const [imgErrored, setImgErrored] = useState(false);

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          padding: 48,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            border: '2px solid var(--border2)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'spin 0.75s linear infinite',
          }}
        />
        <div
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Finding your next favourite…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '48px 28px',
          textAlign: 'center',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 36,
            color: 'var(--danger)',
            marginBottom: 12,
          }}
        >
          !
        </div>
        <p style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</p>
      </div>
    );
  }

  if (!recommendation) {
    return (
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '48px 28px',
          textAlign: 'center',
          color: 'var(--muted)',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 36,
            color: 'var(--accent)',
            marginBottom: 12,
          }}
        >
          ♪
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.6 }}>
          Your next favourite album is waiting.
          <br />
          Set your preferences and hit the button.
        </p>
      </div>
    );
  }

  const year =
    recommendation.year.length > 0 ? recommendation.year : (artworkResponse?.year ?? '—');

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        animation: 'fadeUp 0.4s ease both',
        marginBottom: 12,
      }}
    >
      <div className="recommendation-card-content" style={{ display: 'flex', gap: 24 }}>
        <div
          className="recommendation-card-artwork"
          style={{
            borderRadius: 8,
            overflow: 'hidden',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
          }}
        >
          {artworkResponse?.artworkUrl && !imgErrored ? (
            <img
              src={getProxiedArtworkUrl(artworkResponse.artworkUrl)}
              alt={`${recommendation.album} album artwork`}
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
                color: 'var(--muted)',
                fontSize: 40,
                fontFamily: 'var(--serif)',
              }}
            >
              ♪
            </div>
          )}
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 26,
              fontWeight: 400,
              lineHeight: 1.2,
              marginBottom: 8,
            }}
          >
            {recommendation.album}
          </div>
          <div
            style={{
              fontSize: 14,
              color: 'var(--accent)',
              marginBottom: 6,
              letterSpacing: '0.02em',
            }}
          >
            {recommendation.artist}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              marginBottom: 20,
              letterSpacing: '0.06em',
            }}
          >
            {year}
          </div>
          <ServiceLinks
            appleMusicDirectUrl={artworkResponse?.appleMusicUrl ?? null}
            appleMusicSearchUrl={buildAppleMusicSearchUrl(
              recommendation.artist,
              recommendation.album,
            )}
            spotifyDirectUrl={artworkResponse?.spotifyUrl ?? null}
            spotifySearchUrl={buildSpotifySearchUrl(recommendation.artist, recommendation.album)}
          />
        </div>
      </div>
      <div
        className="recommendation-card-reason"
        style={{
          borderTop: '1px solid var(--border)',
          fontSize: 15,
          color: 'var(--muted)',
          lineHeight: 1.7,
          fontStyle: 'italic',
          fontFamily: 'var(--serif)',
        }}
      >
        {recommendation.reason}
      </div>
    </div>
  );
}
