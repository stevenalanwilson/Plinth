import React from 'react';
import { useArtistEssentials } from './useArtistEssentials';
import { EssentialsResult } from './EssentialsResult';

interface ArtistEssentialsPanelProps {
  onSeedArtist?: (artist: string) => void;
}

export function ArtistEssentialsPanel({
  onSeedArtist,
}: ArtistEssentialsPanelProps): React.ReactElement {
  const { artist, setArtist, result, isLoading, error, isLimitReached, fetchEssentials } =
    useArtistEssentials();

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    void fetchEssentials();
  }

  return (
    <section className="essentials-panel" aria-labelledby="essentials-title">
      <h2 id="essentials-title" className="essentials-title">
        Artist Essentials
      </h2>
      <p className="essentials-intro">
        Love a particular artist or band? Enter their name and Plinth shows where to start with
        them, then essential albums by the people around them: band members, side projects,
        collaborators and producers.
      </p>
      <form onSubmit={handleSubmit} className="essentials-input-row">
        <input
          type="text"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="Artist or band…"
          maxLength={100}
          className="essentials-input"
          disabled={isLoading}
          aria-label="Artist name"
        />
        <button type="submit" className="app-cta-button essentials-submit" disabled={isLoading}>
          {isLoading ? 'Finding essentials…' : 'Get essentials'}
        </button>
      </form>

      {error !== null && (
        <p
          role={isLimitReached ? 'status' : 'alert'}
          style={{
            marginTop: 12,
            fontSize: 12,
            // Nothing has gone wrong when the day's picks are used up, so it isn't shown as a fault.
            color: isLimitReached ? 'var(--muted)' : 'var(--danger)',
            fontFamily: 'var(--mono)',
          }}
        >
          {error}
        </p>
      )}

      {result !== null && <EssentialsResult result={result} onSeedArtist={onSeedArtist} />}
    </section>
  );
}
