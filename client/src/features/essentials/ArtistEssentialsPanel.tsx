import React from 'react';
import { useArtistEssentials } from './useArtistEssentials';
import { ArtistSearchBox } from './ArtistSearchBox';
import { useArtistSuggestions } from './useArtistSuggestions';
import { EssentialsResult } from './EssentialsResult';
import { PageHeader } from '../../components/PageHeader';

interface ArtistEssentialsPanelProps {
  onSeedArtist?: (artist: string) => void;
  /** Artists in the person's crate, offered first as they type. */
  crateArtists?: readonly string[];
}

const NO_ARTISTS: readonly string[] = [];

export function ArtistEssentialsPanel({
  onSeedArtist,
  crateArtists = NO_ARTISTS,
}: ArtistEssentialsPanelProps): React.ReactElement {
  const {
    artist,
    setArtist,
    chosen,
    chooseArtist,
    result,
    isLoading,
    error,
    isLimitReached,
    fetchEssentials,
  } = useArtistEssentials();
  // Not while looking someone up, or once they are chosen: the name is filled in and settled.
  const { options, isSearching } = useArtistSuggestions({
    query: artist,
    crateArtists,
    isEnabled: !isLoading && chosen === null,
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    void fetchEssentials();
  }

  return (
    <section className="essentials-panel" aria-labelledby="essentials-title">
      <PageHeader title="Artist Essentials" titleId="essentials-title" />
      <p className="essentials-intro">
        Love a particular artist or band? Enter their name and Plinth shows where to start with
        them, then essential albums by the people around them: band members, side projects,
        collaborators and producers.
      </p>
      <form onSubmit={handleSubmit} className="essentials-input-row">
        <ArtistSearchBox
          value={artist}
          onChange={setArtist}
          options={options}
          isSearching={isSearching}
          onChoose={(option) =>
            void chooseArtist({ name: option.name, id: option.artistId, detail: option.detail })
          }
          disabled={isLoading}
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
