import { useEffect, useMemo, useRef, useState } from 'react';
import { AlbumSearchResult } from '@shared/types';
import { ComboboxOption } from '../../components/SearchCombobox';
import { searchAlbums } from '../../services/apiClient';
import { PickedAlbum } from './topThree';

/** One line in the list of albums offered while typing. */
export interface AlbumOption extends ComboboxOption {
  /** The album to add if this line is chosen. */
  readonly album: PickedAlbum;
}

// Long enough that a run of keystrokes is one question: each is a query to MusicBrainz.
const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;
const MAX_CRATE_OPTIONS = 3;
const CRATE_DETAIL = 'In your crate';

function tidy(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().split(' ').filter(Boolean);
}

function describe(album: PickedAlbum, ...extra: string[]): string {
  return [album.artist, album.year, ...extra].filter(Boolean).join(' · ');
}

/** Albums whose artist or title has a word starting with each word typed. */
function crateMatches(query: string, crateAlbums: readonly PickedAlbum[]): AlbumOption[] {
  const typed = wordsOf(query);
  const matches: AlbumOption[] = [];
  for (const album of crateAlbums) {
    const words = wordsOf(`${album.artist} ${album.album}`);
    if (!typed.every((word) => words.some((candidate) => candidate.startsWith(word)))) continue;
    matches.push({
      key: `crate:${album.releaseGroupId}`,
      name: album.album,
      detail: describe(album, CRATE_DETAIL),
      album,
    });
    if (matches.length === MAX_CRATE_OPTIONS) break;
  }
  return matches;
}

function toPicked({ releaseGroupId, artist, album, year }: AlbumSearchResult): PickedAlbum {
  return { releaseGroupId, artist, album, year };
}

function toOption(result: AlbumSearchResult): AlbumOption {
  const album = toPicked(result);
  return {
    key: `mb:${album.releaseGroupId}`,
    name: album.album,
    detail: describe(album),
    album,
  };
}

interface AlbumSearchState {
  readonly options: readonly AlbumOption[];
  /** True from typing until the server has answered (or failed to), so something can say so. */
  readonly isSearching: boolean;
  /** True when the server couldn't be asked about the text now typed. */
  readonly hasFailed: boolean;
}

interface UseAlbumSearchOptions {
  readonly query: string;
  /** Albums in the person's crate, offered first and without asking the server. */
  readonly crateAlbums: readonly PickedAlbum[];
  /** IDs of albums not to offer, because they are already in the list. */
  readonly excluded: readonly string[];
  /** False while a search isn't wanted, such as when the list is full. */
  readonly isEnabled: boolean;
}

/**
 * Albums to offer as someone types. The crate answers at once; MusicBrainz, through the server,
 * answers once typing pauses, and an earlier question is dropped when a later one is asked. A
 * failure is reported, since an album that can't be found is not the same as a search that
 * couldn't be made.
 */
export function useAlbumSearch({
  query,
  crateAlbums,
  excluded,
  isEnabled,
}: UseAlbumSearchOptions): AlbumSearchState {
  const text = tidy(query);
  const key = text.toLowerCase();
  const isSearchable = isEnabled && text.length >= MIN_QUERY_LENGTH;
  const [remote, setRemote] = useState<{
    readonly query: string;
    readonly results: readonly AlbumSearchResult[];
  } | null>(null);
  // How the lookup for each query ended: not ended is what "searching" is.
  const [outcome, setOutcome] = useState<{
    readonly query: string;
    readonly failed: boolean;
  } | null>(null);
  // What the server said for each query this visit, so backspacing doesn't ask again.
  const answered = useRef(new Map<string, readonly AlbumSearchResult[]>());

  useEffect(() => {
    if (!isSearchable) {
      setRemote(null);
      return;
    }
    const known = answered.current.get(key);
    if (known) {
      setRemote({ query: key, results: known });
      setOutcome({ query: key, failed: false });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchAlbums(text, controller.signal)
        .then((response) => {
          // An empty answer may only mean the server was busy, so it isn't kept to be reused.
          if (response.results.length > 0) answered.current.set(key, response.results);
          setRemote({ query: key, results: response.results });
          setOutcome({ query: key, failed: false });
        })
        .catch(() => {
          // Dropped for newer text is not an ending: that text is the one being waited for.
          if (!controller.signal.aborted) setOutcome({ query: key, failed: true });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isSearchable, key, text]);

  const options = useMemo(() => {
    if (!isSearchable) return [];
    const skipped = new Set(excluded);
    const local = crateMatches(text, crateAlbums).filter(
      (option) => !skipped.has(option.album.releaseGroupId),
    );
    const offered = new Set(local.map((option) => option.album.releaseGroupId));
    const fromServer =
      remote?.query === key
        ? remote.results
            .filter((result) => !skipped.has(result.releaseGroupId))
            .filter((result) => !offered.has(result.releaseGroupId))
            .map(toOption)
        : [];
    return [...local, ...fromServer];
  }, [isSearchable, remote, key, text, crateAlbums, excluded]);

  const hasEnded = outcome?.query === key;
  return {
    options,
    isSearching: isSearchable && !hasEnded,
    hasFailed: isSearchable && hasEnded && outcome.failed,
  };
}
