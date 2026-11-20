import React from 'react';
import { ArtistEssentialsResponse, ConnectedAlbum, EssentialAlbum } from '@shared/types';
import { ListeningLinks } from '../../components/ListeningLinks';
import { EssentialCover } from './EssentialCover';

interface EssentialsResultProps {
  readonly result: ArtistEssentialsResponse;
  readonly onSeedArtist?: (artist: string) => void;
}

interface AlbumCardProps {
  readonly entry: EssentialAlbum;
  /** Who made the album: the cover, its placeholder and the listening links go by this name. */
  readonly artist: string;
  readonly size: 'large' | 'small';
  /** A line under the title, such as who the artist is to the one searched for. */
  readonly byline?: string;
}

/** An essential album with its cover, reason and listening links. */
function EssentialAlbumCard({ entry, artist, size, byline }: AlbumCardProps): React.ReactElement {
  return (
    <article className="essentials-album-row" data-size={size}>
      <div className="essentials-album-cover">
        <EssentialCover artist={artist} album={entry.album} releaseGroupId={entry.releaseGroupId} />
      </div>
      <div className="essentials-album-body">
        <div className="essentials-album-heading">
          <h4 className="essentials-album-title">{entry.album}</h4>
          <span className="essentials-album-meta">{entry.year}</span>
        </div>
        {byline !== undefined && <p className="essentials-album-byline">{byline}</p>}
        <p className="essentials-album-reason">{entry.reason}</p>
        <ListeningLinks artist={artist} album={entry.album} />
      </div>
    </article>
  );
}

function Section({
  id,
  title,
  note,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly note: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="essentials-section" aria-labelledby={id}>
      <h3 id={id} className="essentials-section-title">
        {title}
      </h3>
      <p className="essentials-section-note">{note}</p>
      {children}
    </section>
  );
}

const COUNT_WORDS = ['', 'one', 'two', 'three'];

function startHereNote(count: number): string {
  if (count === 1) return 'The album to begin with, and why.';
  return `The ${COUNT_WORDS[count] ?? count} albums to begin with, and why.`;
}

function connectedByline(album: ConnectedAlbum): string {
  return `${album.artist} · ${album.connection}`;
}

/**
 * Where to start with an artist, then essential albums by the people around them: the members,
 * side projects, collaborators and producers.
 */
export function EssentialsResult({
  result,
  onSeedArtist,
}: EssentialsResultProps): React.ReactElement {
  const { artist, albums, related } = result;

  return (
    <div className="essentials-result">
      <div className="essentials-result-header">
        <h2 className="essentials-artist">{artist}</h2>
        {onSeedArtist !== undefined && (
          <button type="button" className="nav-tab" onClick={() => onSeedArtist(artist)}>
            Recommend from this artist →
          </button>
        )}
      </div>

      <Section id="essentials-start-here" title="Start here" note={startHereNote(albums.length)}>
        <div className="essentials-list">
          {albums.map((entry) => (
            <EssentialAlbumCard
              key={entry.releaseGroupId ?? entry.album}
              entry={entry}
              artist={artist}
              size="large"
            />
          ))}
        </div>
      </Section>

      <Section
        id="essentials-related"
        title="Then the people around them"
        note={`Essential albums by ${artist}'s members, side projects, collaborators and producers.`}
      >
        {related.length === 0 ? (
          <p className="essentials-empty">
            We couldn&apos;t confirm any albums connected to {artist} this time. Try again a little
            later.
          </p>
        ) : (
          <div className="essentials-list">
            {related.map((entry) => (
              <EssentialAlbumCard
                key={entry.releaseGroupId ?? `${entry.artist}-${entry.album}`}
                entry={entry}
                artist={entry.artist}
                size="small"
                byline={connectedByline(entry)}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
