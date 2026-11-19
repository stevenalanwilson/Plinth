import React, { useState, useCallback } from 'react';
import { PivotHint } from '@shared/types';
import { useRecommendation } from './hooks/useRecommendation';
import { PreferencesPanel, sectionLabelStyle } from './features/preferences/PreferencesPanel';
import { RecommendationCard } from './features/recommendation/RecommendationCard';
import { HistoryGrid } from './features/history/HistoryGrid';
import { CratePage } from './features/crate/CratePage';
import { InsightsPage } from './features/stats/InsightsPage';
import { ArtistEssentialsPanel } from './features/essentials/ArtistEssentialsPanel';
import { VibePresets } from './features/presets/VibePresets';
import { useMoreLikeThisFromNavigation } from './features/recommendation/useMoreLikeThisFromNavigation';
import { AccountMenu } from './features/account/AccountMenu';
import { SaveCrateNudge } from './features/account/SaveCrateNudge';
import { useAccountSession } from './features/account/useAccountSession';

type Page = 'home' | 'crate' | 'insights' | 'essentials';

export default function App(): React.ReactElement {
  const [page, setPage] = useState<Page>('home');
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
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
    currentEntry,
    isLoading,
    error,
    isLimitReached,
    fetchRecommendation,
    clearHistory,
    removeFromHistory,
    selectFromHistory,
    importHistory,
    setFeedback,
    getHistory,
    mergeServerLibrary,
    discardCrate,
  } = useRecommendation();
  const { account, isChecking, requestLink, signOut, deleteAccount, sync } = useAccountSession({
    history,
    getHistory,
    applyRemote: mergeServerLibrary,
    discardCrate,
  });
  // An album page's "Find me something like this" lands here and starts the pick at once.
  useMoreLikeThisFromNavigation(
    useCallback((pivot: PivotHint) => void fetchRecommendation(pivot), [fetchRecommendation]),
  );
  // Fixed for the visit, so the page doesn't rearrange itself when the first pick arrives, and
  // the presets stay to hand for trying another.
  const [isFirstVisit] = useState(recommendation === null);

  return (
    <div className="app-layout" data-first-visit={isFirstVisit}>
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
          Whole records, picked for you
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
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
              data-active={page === 'crate' || page === 'insights'}
              onClick={() => setPage('crate')}
            >
              Crate
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
          <AccountMenu
            account={account}
            isChecking={isChecking}
            onRequestLink={requestLink}
            onSignOut={signOut}
            onDeleteAccount={deleteAccount}
            sync={sync}
            isOpen={isAccountMenuOpen}
            onOpenChange={setIsAccountMenuOpen}
          />
        </div>
      </header>

      {page === 'crate' ? (
        <div className="app-full">
          <SaveCrateNudge
            history={history}
            isSignedIn={account !== null}
            isChecking={isChecking}
            onSignIn={() => {
              // The menu is in the header, which may be out of sight on a long crate.
              window.scrollTo({ top: 0 });
              setIsAccountMenuOpen(true);
            }}
          />
          <CratePage
            history={history}
            onSelect={(id) => {
              selectFromHistory(id);
              setPage('home');
            }}
            onRemove={removeFromHistory}
            onClear={clearHistory}
            onImport={importHistory}
            onFeedback={setFeedback}
            onOpenInsights={() => setPage('insights')}
          />
        </div>
      ) : page === 'insights' ? (
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
            {isFirstVisit && (
              <VibePresets
                preferences={preferences}
                vibeQuery={vibeQuery}
                onSelect={(preset) => {
                  updatePreferences(preset.preferences);
                  updateVibeQuery(preset.vibeQuery);
                }}
              />
            )}
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
              isLimitReached={isLimitReached}
              onSeedArtist={(name) => void fetchRecommendation(undefined, name)}
              feedback={currentEntry?.feedback?.status ?? null}
              onFeedback={(status) => {
                if (currentEntry) setFeedback(currentEntry.id, status);
              }}
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
        <a href="/privacy" className="footer-link">
          Privacy
        </a>
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
