import React from 'react';
import {
  ALL_TIME_QUALIFIER,
  Genre,
  GENRE_OPTIONS,
  genreQualifier,
  ListQualifier,
  listTitle,
} from '@shared/types';
import { TOP_THREE_SIZE } from './topThree';
import { useOwnLists } from './useOwnLists';

interface MyListsPageProps {
  /** Opens the builder for one list, whether or not it has been started. */
  readonly onOpen: (qualifier: ListQualifier) => void;
}

/** How far along a list is, in words. */
function progress(albumCount: number): string {
  if (albumCount >= TOP_THREE_SIZE) return 'Finished, ready to share';
  return `${albumCount} of ${TOP_THREE_SIZE} chosen`;
}

/**
 * Everything the person has made, and a way to start a top 3 of a genre. The one of all time is
 * always at the top, whether or not it has been started.
 */
export function MyListsPage({ onOpen }: MyListsPageProps): React.ReactElement {
  const { status, lists, reload } = useOwnLists();

  if (status === 'loading') {
    return (
      <section className="my-lists" aria-label="Your lists">
        <p role="status" className="top-three-note">
          Loading your lists…
        </p>
      </section>
    );
  }

  if (status === 'failed') {
    return (
      <section className="my-lists" aria-label="Your lists">
        <p role="alert" className="top-three-note">
          We couldn&apos;t load your lists.
        </p>
        <button type="button" className="crate-action" onClick={reload}>
          Try again
        </button>
      </section>
    );
  }

  const countOf = (qualifier: ListQualifier): number | null =>
    lists.find((list) => list.kind === 'top' && list.qualifier === qualifier)?.albums.length ??
    null;
  const startedGenres = GENRE_OPTIONS.filter((genre) => countOf(genreQualifier(genre)) !== null);
  const unstartedGenres = GENRE_OPTIONS.filter((genre) => countOf(genreQualifier(genre)) === null);
  const shown: readonly ListQualifier[] = [
    ALL_TIME_QUALIFIER,
    ...startedGenres.map(genreQualifier),
  ];

  return (
    <section className="my-lists" aria-label="Your lists">
      <p className="top-three-intro">
        Your three best albums, of all time and in any genre you like. Each list has a link of its
        own to share.
      </p>

      <ul className="my-lists-items" role="list" aria-label="Your lists">
        {shown.map((qualifier) => {
          const count = countOf(qualifier);
          const title = listTitle('top', qualifier, TOP_THREE_SIZE);
          return (
            <li key={qualifier} className="my-lists-item">
              <div>
                <div className="my-lists-title">{title}</div>
                <div className="top-three-count">
                  {count === null ? 'Not started' : progress(count)}
                </div>
              </div>
              <button
                type="button"
                className="crate-action"
                aria-label={`${count === null ? 'Start' : 'Edit'} ${title}`}
                onClick={() => onOpen(qualifier)}
              >
                {count === null ? 'Start' : 'Edit'}
              </button>
            </li>
          );
        })}
      </ul>

      {unstartedGenres.length > 0 && (
        <div className="my-lists-start">
          <h2 className="top-three-label">Start a top 3 of a genre</h2>
          <ul className="my-lists-genres" role="list" aria-label="Genres">
            {unstartedGenres.map((genre: Genre) => (
              <li key={genre}>
                <button
                  type="button"
                  className="crate-action"
                  onClick={() => onOpen(genreQualifier(genre))}
                >
                  {genre}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
