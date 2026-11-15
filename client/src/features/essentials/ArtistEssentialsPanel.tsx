import React from 'react';
import { EssentialAlbum } from '@shared/types';
import { useArtistEssentials } from './useArtistEssentials';
import {
  buildAppleMusicSearchUrl,
  buildSpotifySearchUrl,
  buildDiscogsSearchUrl,
} from '../../services/apiClient';

interface ArtistEssentialsPanelProps {
  onSeedArtist?: (artist: string) => void;
}

interface AlbumRowProps {
  entry: EssentialAlbum;
  artist: string;
}

function AlbumRow({ entry, artist }: AlbumRowProps): React.ReactElement {
  return (
    <div className="essentials-album-row">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 4,
        }}
      >
        <span className="essentials-album-title">{entry.album}</span>
        <span className="essentials-album-meta">{entry.year}</span>
      </div>
      <p className="essentials-album-reason">{entry.reason}</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <a
          href={buildAppleMusicSearchUrl(artist, entry.album)}
          target="_blank"
          rel="noopener noreferrer"
          className="essentials-link"
        >
          Apple Music
        </a>
        <a
          href={buildSpotifySearchUrl(artist, entry.album)}
          target="_blank"
          rel="noopener noreferrer"
          className="essentials-link"
        >
          Spotify
        </a>
        <a
          href={buildDiscogsSearchUrl(artist, entry.album)}
          target="_blank"
          rel="noopener noreferrer"
          className="essentials-link"
        >
          Discogs
        </a>
      </div>
    </div>
  );
}

export function ArtistEssentialsPanel({
  onSeedArtist,
}: ArtistEssentialsPanelProps): React.ReactElement {
  const { artist, setArtist, result, isLoading, error, fetchEssentials } = useArtistEssentials();

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    void fetchEssentials();
  }

  return (
    <div className="essentials-panel">
      <form onSubmit={handleSubmit} className="essentials-input-row">
        <input
          type="text"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="Enter an artist name…"
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
          style={{ marginTop: 12, fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--mono)' }}
        >
          {error}
        </p>
      )}

      {result !== null && (
        <div style={{ marginTop: 24 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 16,
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontWeight: 400,
                fontSize: 22,
              }}
            >
              {result.artist}
            </h2>
            {onSeedArtist !== undefined && (
              <button type="button" className="nav-tab" onClick={() => onSeedArtist(result.artist)}>
                Recommend from this artist →
              </button>
            )}
          </div>
          <div className="essentials-list">
            {result.albums.map((entry) => (
              <AlbumRow key={entry.album} entry={entry} artist={result.artist} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
