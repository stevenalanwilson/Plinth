import React from 'react';
import { ArtistEssentialsResponse, EssentialAlbum } from '@shared/types';
import { ListeningLinks } from '../../components/ListeningLinks';
import { EssentialCover } from './EssentialCover';
import { DiscographyRow, layOutEssentials } from './essentialsLayout';

interface EssentialsResultProps {
  readonly result: ArtistEssentialsResponse;
  readonly onSeedArtist?: (artist: string) => void;
}

interface AlbumProps {
  readonly entry: EssentialAlbum;
  readonly artist: string;
}

/** An essential album with its cover, reason and listening links. */
function EssentialAlbumCard({
  entry,
  artist,
  size,
}: AlbumProps & { readonly size: 'large' | 'small' }): React.ReactElement {
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
        <p className="essentials-album-reason">{entry.reason}</p>
        <ListeningLinks artist={artist} album={entry.album} />
      </div>
    </article>
  );
}

function DiscographyItem({
  row,
  artist,
}: {
  readonly row: DiscographyRow;
  readonly artist: string;
}): React.ReactElement {
  if (row.essential) {
    return (
      <li className="discography-item" data-essential="true">
        <EssentialAlbumCard entry={row.essential} artist={artist} size="small" />
      </li>
    );
  }
  return (
    <li className="discography-item">
      <span className="discography-year">{row.year ?? '—'}</span>
      <span className="discography-title">{row.title}</span>
    </li>
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

function EssentialList({
  albums,
  artist,
}: {
  readonly albums: readonly EssentialAlbum[];
  readonly artist: string;
}): React.ReactElement {
  return (
    <div className="essentials-list">
      {albums.map((entry) => (
        <EssentialAlbumCard
          key={entry.releaseGroupId ?? entry.album}
          entry={entry}
          artist={artist}
          size="small"
        />
      ))}
    </div>
  );
}

const COUNT_WORDS = ['', 'one', 'two', 'three'];

function startHereNote(count: number): string {
  if (count === 1) return 'The album to begin with, and why.';
  return `The ${COUNT_WORDS[count] ?? count} albums to begin with, and why.`;
}

/** An artist's essentials: where to start, then the rest of their albums in order. */
export function EssentialsResult({
  result,
  onSeedArtist,
}: EssentialsResultProps): React.ReactElement {
  const layout = layOutEssentials(result);
  const { artist } = result;

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

      {layout.kind === 'list' ? (
        <EssentialList albums={layout.albums} artist={artist} />
      ) : (
        <>
          <Section
            id="essentials-start-here"
            title="Start here"
            note={startHereNote(layout.startHere.length)}
          >
            <div className="essentials-list">
              {layout.startHere.map((entry) => (
                <EssentialAlbumCard
                  key={entry.releaseGroupId ?? entry.album}
                  entry={entry}
                  artist={artist}
                  size="large"
                />
              ))}
            </div>
          </Section>

          {layout.kind === 'discography' && layout.rest.length > 0 && (
            <Section
              id="essentials-discography"
              title="Then the rest"
              note="Every other album, oldest first. The essentials say why they matter."
            >
              <ol className="discography">
                {layout.rest.map((row) => (
                  <DiscographyItem key={row.releaseGroupId} row={row} artist={artist} />
                ))}
              </ol>
            </Section>
          )}

          {layout.kind === 'essentials' && layout.rest.length > 0 && (
            <Section
              id="essentials-more"
              title="Then these"
              note="The other essentials, in the order to listen to them."
            >
              <EssentialList albums={layout.rest} artist={artist} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
