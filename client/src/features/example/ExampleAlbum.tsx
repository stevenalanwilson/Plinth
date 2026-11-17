import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlbumResponse } from '@shared/types';
import { getProxiedArtworkUrl } from '../../services/apiClient';
import { PlaceholderSleeve } from '../../components/PlaceholderSleeve';

interface ExampleAlbumProps {
  readonly album: AlbumResponse;
}

/** Shows a first-time visitor the kind of record Plinth picks, before they've asked for one. */
export function ExampleAlbum({ album }: ExampleAlbumProps): React.ReactElement {
  const [coverFailed, setCoverFailed] = useState(false);

  return (
    <article className="example-album" aria-labelledby="example-album-title">
      <p className="example-album-label">An example pick</p>
      <div className="example-album-body">
        <div className="example-album-cover">
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
        <div className="example-album-text">
          <h2 id="example-album-title" className="example-album-title">
            {album.album}
          </h2>
          <p className="example-album-artist">{album.artist}</p>
          {album.year && <p className="example-album-year">{album.year}</p>}
          <Link to={`/album/${encodeURIComponent(album.slug)}`} className="example-album-link">
            See the album
          </Link>
        </div>
      </div>
      {album.hook && <p className="example-album-hook">{album.hook}</p>}
      <p className="example-album-prompt">
        Someone else’s pick. Set your vibe and Plinth will find one for you.
      </p>
    </article>
  );
}
