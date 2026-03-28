import React from 'react';
import { useRecommendation } from './hooks/useRecommendation';
import { PreferencesPanel } from './features/preferences/PreferencesPanel';
import { RecommendationCard } from './features/recommendation/RecommendationCard';
import { HistoryGrid } from './features/history/HistoryGrid';

export default function App(): React.ReactElement {
  const {
    preferences,
    updatePreferences,
    recommendation,
    artworkResponse,
    history,
    isLoading,
    error,
    fetchRecommendation,
    clearHistory,
    removeFromHistory,
  } = useRecommendation();

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 'clamp(28px, 8vw, 42px)',
            fontWeight: 400,
            fontStyle: 'italic',
            letterSpacing: '-0.5px',
            lineHeight: 1.1,
          }}
        >
          Plinth
        </h1>
        <p
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            marginTop: 8,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Music to work too
        </p>
      </header>

      <div className="app-sidebar">
        <PreferencesPanel preferences={preferences} onChange={updatePreferences} />
      </div>

      <div className="app-main">
        <RecommendationCard
          recommendation={recommendation}
          artworkResponse={artworkResponse}
          isLoading={isLoading}
          error={error}
        />

        <button
          type="button"
          className="app-cta-button"
          onClick={fetchRecommendation}
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '16px',
            fontSize: 14,
            letterSpacing: '0.04em',
            borderRadius: 'var(--radius)',
            marginTop: 8,
            background: 'var(--accent)',
            border: '1px solid var(--accent)',
            color: '#0e0e0f',
            fontFamily: 'var(--mono)',
            fontWeight: 500,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.35 : 1,
          }}
        >
          {isLoading ? 'Finding your next favourite…' : 'Find me something to listen to'}
        </button>

        {history.length > 1 && (
          <>
            <div style={{ height: 1, background: 'var(--border)', margin: '40px 0' }} />
            <HistoryGrid
              history={history.slice(1)}
              onClear={clearHistory}
              onRemove={removeFromHistory}
            />
          </>
        )}
      </div>
    </div>
  );
}
