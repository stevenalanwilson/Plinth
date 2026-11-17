import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlbumResponse } from '@shared/types';
import {
  buildAppleMusicSearchUrl,
  buildDiscogsSearchUrl,
  buildSpotifySearchUrl,
  getProxiedArtworkUrl,
} from '../../services/apiClient';
import { PlaceholderSleeve } from '../../components/PlaceholderSleeve';
import { ServiceLinks } from '../../components/ServiceLinks';
import { useAlbum } from './useAlbum';

const DEFAULT_TITLE = 'Plinth';

function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title === null) return;
    document.title = title;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}

function Header(): React.ReactElement {
  return (
    <header className="album-page-header">
      <Link to="/" className="album-page-wordmark">
        Plinth
      </Link>
    </header>
  );
}

function GetYourOwnPick(): React.ReactElement {
  return (
    <div className="album-page-cta">
      <p>Plinth picks one album at a time, to fit your mood.</p>
      <Link to="/" className="album-page-cta-link">
        Get your own pick
      </Link>
    </div>
  );
}

function Message({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return <p className="album-page-message">{children}</p>;
}

function AlbumDetails({ album }: { readonly album: AlbumResponse }): React.ReactElement {
  const [coverFailed, setCoverFailed] = useState(false);
  const details = [...album.genres, ...(album.country ? [album.country] : [])].join(' · ');

  return (
    <article className="album-page-card">
      <div className="album-page-cover">
        {album.artworkUrl && !coverFailed ? (
          <img
            src={getProxiedArtworkUrl(album.artworkUrl)}
            alt={`${album.album} album artwork`}
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <PlaceholderSleeve artist={album.artist} album={album.album} />
        )}
      </div>
      <div className="album-page-info">
        <h1 className="album-page-title">{album.album}</h1>
        <div className="album-page-artist">{album.artist}</div>
        {album.year && <div className="album-page-year">{album.year}</div>}
        {album.hook && <p className="album-page-hook">{album.hook}</p>}
        {details && <div className="album-page-details">{details}</div>}
        <ServiceLinks
          appleMusicDirectUrl={album.appleMusicUrl}
          appleMusicSearchUrl={buildAppleMusicSearchUrl(album.artist, album.album)}
          spotifyUrl={buildSpotifySearchUrl(album.artist, album.album)}
          discogsUrl={buildDiscogsSearchUrl(album.artist, album.album)}
        />
      </div>
    </article>
  );
}

export function AlbumPage(): React.ReactElement {
  const { slug = '' } = useParams();
  const { state, retry } = useAlbum(slug);

  useDocumentTitle(
    state.status === 'ready' ? `${state.album.album} by ${state.album.artist} · Plinth` : null,
  );

  return (
    <div className="album-page">
      <Header />
      <main>
        {state.status === 'loading' && <Message>Loading album…</Message>}
        {state.status === 'ready' && <AlbumDetails album={state.album} />}
        {state.status === 'not-found' && <Message>We couldn&apos;t find that album.</Message>}
        {state.status === 'error' && (
          <>
            <Message>{state.message}</Message>
            <button type="button" className="album-page-retry" onClick={retry}>
              Try again
            </button>
          </>
        )}
      </main>
      {state.status !== 'loading' && <GetYourOwnPick />}
    </div>
  );
}
