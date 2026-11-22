import React, { useState } from 'react';
import { RecommendationResponse, ArtworkResponse, ArtistRelation } from '@shared/types';
import { getProxiedArtworkUrl } from '../../services/apiClient';
import { ServiceIconLinks } from '../../components/ServiceIconLinks';
import { PlaceholderSleeve } from '../../components/PlaceholderSleeve';
import { ShareButton } from '../../components/ShareButton';
import { FeedbackButtons } from '../feedback/FeedbackButtons';
import { FeedbackStatus } from '../../types/feedback';

interface RecommendationCardProps {
  recommendation: RecommendationResponse | null;
  artworkResponse: ArtworkResponse | null;
  artistRelations: readonly ArtistRelation[];
  isLoadingRelations: boolean;
  isLoading: boolean;
  error: string | null;
  /** The error is the day's picks being used up: shown calmly, as it isn't a fault. */
  isLimitReached?: boolean;
  onSeedArtist: (name: string) => void;
  /** The verdict already given on this pick, or null for none. */
  feedback: FeedbackStatus | null;
  onFeedback: (status: FeedbackStatus | null) => void;
  /** What to show before there's a pick, chosen by the page so it can react to the settings. */
  emptyState?: React.ReactNode;
}

export function RecommendationCard({
  recommendation,
  artworkResponse,
  artistRelations,
  isLoadingRelations,
  isLoading,
  error,
  isLimitReached = false,
  onSeedArtist,
  feedback,
  onFeedback,
  emptyState = null,
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
        {!isLimitReached && (
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
        )}
        <p
          role={isLimitReached ? 'status' : 'alert'}
          style={{
            fontSize: 13,
            color: isLimitReached ? 'var(--muted)' : 'var(--danger)',
            lineHeight: 1.6,
          }}
        >
          {error}
        </p>
      </div>
    );
  }

  if (!recommendation) return <>{emptyState}</>;

  const year =
    recommendation.year.length > 0 ? recommendation.year : (artworkResponse?.year ?? '—');

  return (
    <div
      className="recommendation-card"
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
            <PlaceholderSleeve artist={recommendation.artist} album={recommendation.album} />
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
          <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: '0.06em' }}>{year}</div>
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
      {/* One bar for everything to do with the pick: what you make of it, then where to find it. */}
      <div className="card-actions">
        <FeedbackButtons status={feedback} onChange={onFeedback} />
        <div className="card-actions-listen" role="group" aria-label="Listen and share">
          <ServiceIconLinks
            artist={recommendation.artist}
            album={recommendation.album}
            appleMusicUrl={artworkResponse?.appleMusicUrl ?? null}
          />
          {recommendation.slug && (
            <>
              <span className="card-actions-divider" aria-hidden="true" />
              <ShareButton
                slug={recommendation.slug}
                album={recommendation.album}
                artist={recommendation.artist}
                hook={recommendation.hook ?? null}
                iconOnly
              />
            </>
          )}
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: 8,
          }}
        >
          Connected artists
        </div>
        {isLoadingRelations ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 12,
                height: 12,
                border: '1.5px solid var(--border2)',
                borderTopColor: 'var(--accent)',
                borderRadius: '50%',
                animation: 'spin 0.75s linear infinite',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Finding connections…</span>
          </div>
        ) : artistRelations.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {artistRelations.map((rel) => (
              <button
                key={rel.name}
                type="button"
                className="pill-button"
                onClick={() => onSeedArtist(rel.name)}
                style={{
                  padding: '5px 10px',
                  fontSize: 11,
                  fontFamily: 'var(--mono)',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 20,
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                {rel.name}
                <span style={{ color: 'var(--muted)', fontSize: 9, marginLeft: 4 }}>
                  {rel.type}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
            No connected artists found
          </span>
        )}
      </div>
    </div>
  );
}
