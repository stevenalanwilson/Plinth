import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlbumResponse } from '@shared/types';
import { getProxiedArtworkUrl } from '../../services/apiClient';
import { PlaceholderSleeve } from '../../components/PlaceholderSleeve';
import { ListenAndShare } from '../../components/ListenAndShare';
import { AlbumDetails } from './AlbumDetails';
import { useAlbum } from './useAlbum';
import { moreLikeThisState } from '../recommendation/moreLikeThis';

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

/**
 * Turns someone who arrived on a shared link into someone trying a pick: one tap for more like
 * this album, or the Discover page to set their own vibe.
 */
function GetYourOwnPick({ album }: { readonly album: AlbumResponse | null }): React.ReactElement {
  const navigate = useNavigate();

  return (
    <div className="album-page-cta">
      <p>Plinth picks one album at a time, to fit your mood.</p>
      <div className="album-page-cta-actions">
        {album && (
          <button
            type="button"
            className="album-page-cta-button"
            onClick={() => navigate('/', { state: moreLikeThisState(album.artist, album.album) })}
          >
            Find me something like this
          </button>
        )}
        <Link to="/" className="album-page-cta-link">
          {album ? 'Or set your own vibe' : 'Get your own pick'}
        </Link>
      </div>
    </div>
  );
}

function Message({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return <p className="album-page-message">{children}</p>;
}

function AlbumCard({ album }: { readonly album: AlbumResponse }): React.ReactElement {
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
        <ListenAndShare
          artist={album.artist}
          album={album.album}
          appleMusicUrl={album.appleMusicUrl}
          slug={album.slug}
          hook={album.hook}
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
        {state.status === 'ready' && (
          <>
            <AlbumCard album={state.album} />
            <AlbumDetails slug={state.album.slug} />
          </>
        )}
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
      {state.status !== 'loading' && (
        <GetYourOwnPick album={state.status === 'ready' ? state.album : null} />
      )}
    </div>
  );
}
