import { useEffect, useMemo, useRef, useState } from 'react';
import { ArtistSuggestion } from '@shared/types';
import { fetchArtistSuggestions } from '../../services/apiClient';

/** One line in the list of artists offered while typing. */
export interface SuggestionOption {
  readonly key: string;
  readonly name: string;
  /** What tells artists with the same name apart, or "In your crate". */
  readonly detail: string;
  /** MusicBrainz ID; null for an artist from the crate, who is then searched for by name. */
  readonly artistId: string | null;
}

// Long enough that a run of keystrokes is one question, short enough to feel immediate.
const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;
const MAX_CRATE_OPTIONS = 3;
const CRATE_DETAIL = 'In your crate';

function tidy(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** Artists in the crate whose name, or any word in it, starts with what was typed. */
function crateMatches(query: string, crateArtists: readonly string[]): SuggestionOption[] {
  const needle = query.toLowerCase();
  const seen = new Set<string>();
  const matches: SuggestionOption[] = [];
  for (const artist of crateArtists) {
    const lower = artist.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    if (lower.startsWith(needle) || lower.includes(` ${needle}`)) {
      matches.push({ key: `crate:${lower}`, name: artist, detail: CRATE_DETAIL, artistId: null });
    }
    if (matches.length === MAX_CRATE_OPTIONS) break;
  }
  return matches;
}

function toOption(suggestion: ArtistSuggestion): SuggestionOption {
  return {
    key: `mb:${suggestion.id}`,
    name: suggestion.name,
    detail: suggestion.detail,
    artistId: suggestion.id,
  };
}

interface ArtistSuggestionsState {
  readonly options: readonly SuggestionOption[];
  /** True from typing until the server has answered (or failed to), so something can say so. */
  readonly isSearching: boolean;
}

interface UseArtistSuggestionsOptions {
  readonly query: string;
  /** Names of artists in the person's crate, offered first and without asking the server. */
  readonly crateArtists: readonly string[];
  /** False while suggestions aren't wanted, such as once one has been chosen. */
  readonly isEnabled: boolean;
}

/**
 * Artists to offer as someone types. The crate answers at once; MusicBrainz, through the server,
 * answers once typing pauses, and an earlier question is dropped when a later one is asked. A
 * failure is no suggestions: typing and searching carry on without them.
 */
export function useArtistSuggestions({
  query,
  crateArtists,
  isEnabled,
}: UseArtistSuggestionsOptions): ArtistSuggestionsState {
  const text = tidy(query);
  const isSearchable = isEnabled && text.length >= MIN_QUERY_LENGTH;
  const [remote, setRemote] = useState<{
    readonly query: string;
    readonly suggestions: readonly ArtistSuggestion[];
  } | null>(null);
  // The query whose lookup has finished, however it ended: not finished is what "searching" is.
  const [settled, setSettled] = useState<string | null>(null);
  // What the server said for each query this visit, so backspacing doesn't ask again.
  const answered = useRef(new Map<string, readonly ArtistSuggestion[]>());

  useEffect(() => {
    if (!isSearchable) {
      setRemote(null);
      return;
    }
    const key = text.toLowerCase();
    const known = answered.current.get(key);
    if (known) {
      setRemote({ query: key, suggestions: known });
      setSettled(key);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchArtistSuggestions(text, controller.signal)
        .then((response) => {
          // An empty answer may only mean the server was busy, so it isn't kept to be reused.
          if (response.suggestions.length > 0) answered.current.set(key, response.suggestions);
          setRemote({ query: key, suggestions: response.suggestions });
          setSettled(key);
        })
        .catch(() => {
          // Dropped for newer text is not an ending: that text is the one being waited for.
          if (!controller.signal.aborted) setSettled(key);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isSearchable, text]);

  const options = useMemo(() => {
    if (!isSearchable) return [];
    const remoteOptions =
      remote?.query === text.toLowerCase() ? remote.suggestions.map(toOption) : [];
    const remoteNames = new Set(remoteOptions.map((option) => option.name.toLowerCase()));
    // The server's version of an artist, which has an ID and says which one, replaces the crate's.
    const local = crateMatches(text, crateArtists).filter(
      (option) => !remoteNames.has(option.name.toLowerCase()),
    );
    return [...local, ...remoteOptions];
  }, [isSearchable, remote, text, crateArtists]);

  return { options, isSearching: isSearchable && settled !== text.toLowerCase() };
}
