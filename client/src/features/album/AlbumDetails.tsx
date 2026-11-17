import React from 'react';
import { AlbumDetailsResponse, AlbumDisc, RelatedAlbum } from '@shared/types';
import {
  buildAppleMusicSearchUrl,
  buildDiscogsSearchUrl,
  buildSpotifySearchUrl,
} from '../../services/apiClient';
import { formatCountry, formatReleaseDate, formatTrackLength } from './albumFormat';
import { useAlbumDetails } from './useAlbumDetails';

interface Fact {
  readonly label: string;
  readonly value: string;
}

function releaseFacts(details: AlbumDetailsResponse): Fact[] {
  const { release, formats } = details;
  const label = [release?.label, release?.catalogueNumber].filter(Boolean).join(' · ');
  const facts: (Fact | null)[] = [
    release?.date ? { label: 'Released', value: formatReleaseDate(release.date) } : null,
    release?.country ? { label: 'Country', value: formatCountry(release.country) } : null,
    label ? { label: 'Label', value: label } : null,
    formats.length > 0 ? { label: 'Formats', value: formats.join(' · ') } : null,
  ];
  return facts.filter((fact): fact is Fact => fact !== null);
}

function discHeading(disc: AlbumDisc): string {
  return ['Disc ' + disc.position, disc.title, disc.format].filter(Boolean).join(' · ');
}

function Tracklist({
  disc,
  heading,
}: {
  readonly disc: AlbumDisc;
  readonly heading: string | null;
}): React.ReactElement {
  return (
    <>
      {heading && <h3 className="album-disc-heading">{heading}</h3>}
      <ol className="album-tracklist" aria-label={heading ? `Tracklist, ${heading}` : 'Tracklist'}>
        {disc.tracks.map((track, index) => (
          <li key={`${track.number}-${index}`}>
            <span className="album-track-number">{track.number}</span>
            <span className="album-track-title">{track.title}</span>
            {track.lengthSeconds !== null && (
              <span className="album-track-length">{formatTrackLength(track.lengthSeconds)}</span>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

function RelatedAlbumRow({
  artist,
  album,
}: {
  readonly artist: string;
  readonly album: RelatedAlbum;
}): React.ReactElement {
  const links = [
    { name: 'Apple Music', href: buildAppleMusicSearchUrl(artist, album.title) },
    { name: 'Spotify', href: buildSpotifySearchUrl(artist, album.title) },
    { name: 'Discogs', href: buildDiscogsSearchUrl(artist, album.title) },
  ];

  return (
    <li>
      <span className="album-related-title">{album.title}</span>
      {album.year && <span className="album-related-year">{album.year}</span>}
      <span className="album-related-links">
        {links.map((link) => (
          <a
            key={link.name}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${album.title} on ${link.name}`}
          >
            {link.name}
          </a>
        ))}
      </span>
    </li>
  );
}

function DetailsBody({ details }: { readonly details: AlbumDetailsResponse }): React.ReactElement {
  const facts = releaseFacts(details);
  const { discs, moreFromArtist } = details;
  const related = moreFromArtist && moreFromArtist.albums.length > 0 ? moreFromArtist : null;

  if (facts.length === 0 && discs.length === 0 && !related) {
    return <p className="album-details-message">No further details found for this album.</p>;
  }

  return (
    <>
      {facts.length > 0 && (
        <dl className="album-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {discs.length > 0 && (
        <section>
          <h2 className="album-details-heading">Tracklist</h2>
          {discs.map((disc) => (
            <Tracklist
              key={disc.position}
              disc={disc}
              heading={discs.length > 1 || disc.title ? discHeading(disc) : null}
            />
          ))}
        </section>
      )}
      {related && (
        <section>
          <h2 className="album-details-heading">More from {related.artist}</h2>
          <ul className="album-related" aria-label={`More from ${related.artist}`}>
            {related.albums.map((album) => (
              <RelatedAlbumRow key={album.title} artist={related.artist} album={album} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function AlbumDetails({ slug }: { readonly slug: string }): React.ReactElement {
  const { state, retry } = useAlbumDetails(slug);

  if (state.status === 'loading') {
    return (
      <div role="status" aria-label="Loading album details" className="album-details-skeleton">
        <div />
        <div />
        <div />
        <div />
      </div>
    );
  }

  return (
    <div className="album-details">
      {state.status === 'error' ? (
        <>
          <p className="album-details-message">{state.message}</p>
          <button type="button" className="album-page-retry" onClick={retry}>
            Try again
          </button>
        </>
      ) : (
        <DetailsBody details={state.details} />
      )}
    </div>
  );
}
