import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ListResponse } from '@shared/types';
import { ArtworkImage } from '../../components/ArtworkImage';
import { ListenAndShare } from '../../components/ListenAndShare';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { likeTheseState, openTopThreeState } from './listNavigation';
import { SaveStoryButton } from './SaveStoryButton';
import { ShareListButton } from './ShareListButton';
import { useList } from './useList';

function Header(): React.ReactElement {
  return (
    <header className="album-page-header">
      <Link to="/" className="album-page-wordmark">
        Plinth
      </Link>
    </header>
  );
}

function Message({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return <p className="album-page-message">{children}</p>;
}

function ListedAlbums({ list }: { readonly list: ListResponse }): React.ReactElement {
  return (
    <ol className="list-page-albums" role="list" aria-label="The albums, best first">
      {list.albums.map((album, index) => (
        <li key={album.releaseGroupId} className="list-page-album">
          <span className="list-page-rank">{index + 1}</span>
          {/* The title is the link to tab to and to hear; the cover is the same link, for a click. */}
          <Link
            to={`/album/${encodeURIComponent(album.slug)}`}
            className="list-page-cover"
            tabIndex={-1}
            aria-hidden="true"
          >
            <ArtworkImage artist={album.artist} album={album.album} artworkUrl={album.artworkUrl} />
          </Link>
          <div className="list-page-info">
            <h2 className="list-page-album-title">
              <Link to={`/album/${encodeURIComponent(album.slug)}`}>{album.album}</Link>
            </h2>
            <div className="album-page-artist">{album.artist}</div>
            {album.year && <div className="album-page-year">{album.year}</div>}
            <ListenAndShare
              artist={album.artist}
              album={album.album}
              appleMusicUrl={album.appleMusicUrl}
              hook={null}
              label={`Listen to ${album.album}`}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Tells the owner a list that isn't full yet isn't being shared: only they can see it. */
function UnfinishedNotice({ list }: { readonly list: ListResponse }): React.ReactElement | null {
  const missing = list.size - list.albums.length;
  if (!list.isOwner || missing <= 0) return null;
  return (
    <p role="status" className="list-page-notice">
      Your list isn&apos;t finished: add {missing} more {missing === 1 ? 'album' : 'albums'} to
      share it.
    </p>
  );
}

/**
 * Turns someone who arrived on a shared list into someone trying Plinth: make their own top 3,
 * or one tap for a pick like these albums. The owner is offered a way back to edit theirs.
 */
function WhatNext({ list }: { readonly list: ListResponse | null }): React.ReactElement {
  const navigate = useNavigate();

  return (
    <div className="album-page-cta">
      <p>Plinth picks one album at a time, to fit your mood.</p>
      <div className="album-page-cta-actions">
        {list && (
          <button
            type="button"
            className="album-page-cta-button"
            onClick={() => navigate('/', { state: openTopThreeState(list.qualifier) })}
          >
            {list.isOwner ? 'Edit my top 3' : 'Make your own top 3'}
          </button>
        )}
        {list && list.albums.length > 0 && (
          <button
            type="button"
            className="album-page-cta-button"
            onClick={() => navigate('/', { state: likeTheseState(list.albums) })}
          >
            Find me something like these
          </button>
        )}
        <Link to="/" className="album-page-cta-link">
          {list ? 'Or set your own vibe' : 'Get your own pick'}
        </Link>
      </div>
    </div>
  );
}

/** A shared list of albums, open to anyone who has its link. */
export function ListPage(): React.ReactElement {
  const { id = '' } = useParams();
  const { state, retry } = useList(id);

  useDocumentTitle(state.status === 'ready' ? `${state.list.title} · Plinth` : null);

  return (
    <div className="album-page list-page">
      <Header />
      <main>
        {state.status === 'loading' && <Message>Loading list…</Message>}
        {state.status === 'ready' && (
          <article className="list-page-card">
            <div className="list-page-heading">
              <h1 className="list-page-title">{state.list.title}</h1>
              {state.list.albums.length >= state.list.size && (
                <div className="list-page-actions">
                  {state.list.isOwner && <SaveStoryButton list={state.list} />}
                  <ShareListButton list={state.list} variant="icon" />
                </div>
              )}
            </div>
            <UnfinishedNotice list={state.list} />
            <ListedAlbums list={state.list} />
          </article>
        )}
        {state.status === 'not-found' && <Message>We couldn&apos;t find that list.</Message>}
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
        <WhatNext list={state.status === 'ready' ? state.list : null} />
      )}
    </div>
  );
}
