import React, { useState, useRef, useEffect } from 'react';
import { PivotHint } from '@shared/types';
import { downloadLibrary, parseLibraryFile } from './services/libraryExport';
import { useRecommendation } from './hooks/useRecommendation';
import { PreferencesPanel, sectionLabelStyle } from './features/preferences/PreferencesPanel';
import { RecommendationCard } from './features/recommendation/RecommendationCard';
import { HistoryGrid } from './features/history/HistoryGrid';
import { InsightsPage } from './features/stats/InsightsPage';
import { ArtistEssentialsPanel } from './features/essentials/ArtistEssentialsPanel';

type Page = 'home' | 'insights' | 'essentials';

export default function App(): React.ReactElement {
  const [page, setPage] = useState<Page>('home');
  const [importError, setImportError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    function handleClickOutside(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);
  const {
    preferences,
    updatePreferences,
    vibeQuery,
    updateVibeQuery,
    recommendation,
    artworkResponse,
    artistRelations,
    isLoadingRelations,
    history,
    isLoading,
    error,
    fetchRecommendation,
    clearHistory,
    removeFromHistory,
    selectFromHistory,
    importHistory,
  } = useRecommendation();

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    // Reset input so the same file can be re-selected if needed
    e.target.value = '';
    void parseLibraryFile(file)
      .then((entries) => importHistory(entries))
      .catch((err: unknown) => {
        setImportError(err instanceof Error ? err.message : 'Failed to import file.');
      });
  }

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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 16,
          }}
        >
          <nav style={{ display: 'flex', gap: 16 }}>
            <button
              type="button"
              className="nav-tab"
              data-active={page === 'home'}
              onClick={() => setPage('home')}
            >
              Discover
            </button>
            <button
              type="button"
              className="nav-tab"
              data-active={page === 'essentials'}
              onClick={() => setPage('essentials')}
            >
              Artist Essentials
            </button>
          </nav>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="nav-tab"
              aria-haspopup="true"
              aria-expanded={isMenuOpen}
              aria-label="Open menu"
              onClick={() => setIsMenuOpen((o) => !o)}
            >
              ···
            </button>
            {isMenuOpen && (
              <div className="dropdown-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item"
                  onClick={() => {
                    setPage('insights');
                    setIsMenuOpen(false);
                  }}
                >
                  {`Insights${history.length > 0 ? ` (${history.length})` : ''}`}
                </button>
                <hr className="dropdown-divider" />
                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setIsMenuOpen(false);
                  }}
                >
                  Import
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item"
                  disabled={history.length === 0}
                  onClick={() => {
                    downloadLibrary(history);
                    setIsMenuOpen(false);
                  }}
                >
                  Export
                </button>
                <hr className="dropdown-divider" />
                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item dropdown-item-danger"
                  disabled={history.length === 0}
                  onClick={() => {
                    clearHistory();
                    setIsMenuOpen(false);
                  }}
                >
                  Clear Library
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
          </div>
        </div>
        {importError !== null && (
          <p
            style={{
              marginTop: 8,
              fontSize: 11,
              color: 'var(--danger)',
              fontFamily: 'var(--mono)',
            }}
          >
            {importError}{' '}
            <button
              type="button"
              onClick={() => setImportError(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--danger)',
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'var(--mono)',
                padding: 0,
              }}
            >
              ✕
            </button>
          </p>
        )}
      </header>

      {page === 'insights' ? (
        <div className="app-full">
          <InsightsPage history={history} />
        </div>
      ) : page === 'essentials' ? (
        <div className="app-full">
          <ArtistEssentialsPanel
            onSeedArtist={(artist) => {
              setPage('home');
              void fetchRecommendation(undefined, artist);
            }}
          />
        </div>
      ) : (
        <>
          <div className="app-sidebar">
            <div style={{ marginBottom: 20 }}>
              <label style={sectionLabelStyle}>Describe your vibe</label>
              <textarea
                value={vibeQuery}
                onChange={(e) => updateVibeQuery(e.target.value)}
                placeholder='"Blink-182 but with Morrissey on vocals"'
                maxLength={300}
                rows={2}
                style={{
                  width: '100%',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text)',
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  padding: '8px 10px',
                  resize: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <PreferencesPanel preferences={preferences} onChange={updatePreferences} />
          </div>

          <div className="app-main">
            <RecommendationCard
              recommendation={recommendation}
              artworkResponse={artworkResponse}
              artistRelations={artistRelations}
              isLoadingRelations={isLoadingRelations}
              isLoading={isLoading}
              error={error}
              onSeedArtist={(name) => void fetchRecommendation(undefined, name)}
            />

            {recommendation && !isLoading && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {(
                  [
                    { type: 'more-like-this', label: 'More like this' },
                    { type: 'something-different', label: 'Something different' },
                  ] as const
                ).map(({ type, label }) => (
                  <button
                    key={type}
                    className="pivot-button"
                    type="button"
                    onClick={() => {
                      const pivot: PivotHint = {
                        type,
                        artist: recommendation.artist,
                        album: recommendation.album,
                      };
                      void fetchRecommendation(pivot);
                    }}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      fontSize: 11,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      fontFamily: 'var(--mono)',
                      fontWeight: 500,
                      borderRadius: 'var(--radius)',
                      background: 'var(--accent2)',
                      border: '1px solid var(--accent2)',
                      color: '#0e0e0f',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="cta-bar">
              <button
                type="button"
                className="app-cta-button"
                onClick={() => void fetchRecommendation()}
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '16px',
                  fontSize: 14,
                  letterSpacing: '0.04em',
                  borderRadius: 'var(--radius)',
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
            </div>

            {history.length > 1 && (
              <>
                <div style={{ height: 1, background: 'var(--border)', margin: '40px 0' }} />
                <HistoryGrid
                  history={history.slice(1)}
                  onRemove={removeFromHistory}
                  onSelect={selectFromHistory}
                />
              </>
            )}
          </div>
        </>
      )}

      <footer className="app-footer">
        {import.meta.env.VITE_MONZO_URL && (
          <a
            href={import.meta.env.VITE_MONZO_URL as string}
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            Support Plinth
          </a>
        )}
        {import.meta.env.VITE_FEEDBACK_EMAIL && (
          <button
            type="button"
            className="footer-link"
            onClick={() => {
              window.location.href = `mailto:${import.meta.env.VITE_FEEDBACK_EMAIL as string}`;
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Get in touch
          </button>
        )}
      </footer>
    </div>
  );
}
