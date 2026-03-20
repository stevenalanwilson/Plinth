import React from 'react';
import { useRecommendation } from './hooks/useRecommendation';
import { LibraryUpload } from './features/library/LibraryUpload';
import { RecommendationCard } from './features/recommendation/RecommendationCard';
import { HistoryGrid } from './features/history/HistoryGrid';

const GENRES = [
  'Electronic / Dance',
  'Hip-Hop / Beats',
  'Indie / Alternative',
  'Post-Punk / New Wave',
  'Art Rock',
  'Ambient / Neoclassical',
  'Folk',
  'Jazz',
  'Drum & Bass / Breakbeat',
  'Metal',
  'Soul / R&B',
  'Classical',
];

export default function App(): React.ReactElement {
  const {
    libraryData,
    setLibraryData,
    genre,
    setGenre,
    recommendation,
    artworkResponse,
    history,
    isLoading,
    error,
    fetchRecommendation,
  } = useRecommendation();

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto', padding: '48px 24px 80px' }}>
      <header style={{ marginBottom: 56 }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 42, fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
          Album Recommender
        </h1>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Powered by your Apple Music library &amp; Claude AI
        </p>
      </header>

      <LibraryUpload libraryData={libraryData} onLibraryParsed={setLibraryData} />

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          Genre <span style={{ opacity: 0.5 }}>(optional)</span>
        </label>
        <select
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 14px',
            color: genre ? 'var(--text)' : 'var(--muted)',
            fontFamily: 'var(--mono)',
            fontSize: 13,
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="">— Any genre —</option>
          {GENRES.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={fetchRecommendation}
        disabled={isLoading || libraryData === null}
        style={{
          width: '100%',
          padding: '16px',
          fontSize: 14,
          letterSpacing: '0.04em',
          borderRadius: 'var(--radius)',
          marginBottom: 40,
          background: 'var(--accent)',
          border: '1px solid var(--accent)',
          color: '#0e0e0f',
          fontFamily: 'var(--mono)',
          fontWeight: 500,
          cursor: isLoading || libraryData === null ? 'not-allowed' : 'pointer',
          opacity: isLoading || libraryData === null ? 0.35 : 1,
        }}
      >
        {isLoading ? 'Finding your next favourite…' : 'Find me something to listen to'}
      </button>

      <RecommendationCard
        recommendation={recommendation}
        artworkResponse={artworkResponse}
        isLoading={isLoading}
        error={error}
      />

      {history.length > 1 && (
        <>
          <div style={{ height: 1, background: 'var(--border)', margin: '40px 0' }} />
          <HistoryGrid history={history.slice(1)} />
        </>
      )}
    </div>
  );
}
