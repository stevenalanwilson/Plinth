import { ArtistSuggestion } from '@shared/types';
import { logger } from '../logger';
import {
  escapeLucene,
  MusicBrainzBusyError,
  musicBrainzFetch,
} from '../repositories/musicBrainzClient';

export const MIN_SUGGESTION_QUERY_LENGTH = 2;
export const MAX_SUGGESTION_QUERY_LENGTH = 60;
const SUGGESTION_LIMIT = 6;
// Suggestions are only worth having at once, so they neither wait long for MusicBrainz nor hold
// a place in the line that an artist's essentials, which people are waiting for, would need.
const SUGGESTION_BUDGET_MS = 4_000;
const MAX_QUEUE_MS = 1_500;

interface MusicBrainzArtist {
  readonly id?: string;
  readonly name?: string;
  readonly type?: string;
  readonly country?: string;
  readonly disambiguation?: string;
}

/** What is typed, with the spacing tidied. */
export function normaliseQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

/**
 * A search for artists whose name starts with what has been typed: every word must be there, and
 * the last, which may be half typed, is matched as a start. Words are lower-cased so that "AND"
 * in a name isn't read as a search operator.
 */
export function suggestionPath(query: string): string {
  const words = normaliseQuery(query).toLowerCase().split(' ').map(escapeLucene);
  const terms = words.map((word, index) => (index === words.length - 1 ? `${word}*` : word));
  const lucene = `artist:(${terms.join(' AND ')})`;
  return `artist?query=${encodeURIComponent(lucene)}&limit=${SUGGESTION_LIMIT}&fmt=json`;
}

/** What tells artists with the same name apart: MusicBrainz's note, else the kind and country. */
function detailOf(artist: MusicBrainzArtist): string {
  const note = artist.disambiguation?.trim();
  if (note) return note;
  return [artist.type, artist.country].filter(Boolean).join(' · ');
}

function toSuggestions(artists: readonly MusicBrainzArtist[]): ArtistSuggestion[] {
  const suggestions: ArtistSuggestion[] = [];
  for (const artist of artists) {
    if (!artist.id || !artist.name) continue;
    const suggestion = { id: artist.id, name: artist.name, detail: detailOf(artist) };
    const isRepeat = suggestions.some(
      (other) => other.name === suggestion.name && other.detail === suggestion.detail,
    );
    if (!isRepeat) suggestions.push(suggestion);
  }
  return suggestions;
}

/**
 * Artists whose names start with what has been typed. Never fails: when MusicBrainz is busy or
 * can't be reached the answer is no suggestions, which leaves typing to carry on as it was.
 */
export async function suggestArtists(
  rawQuery: string,
  budgetSignal: AbortSignal = AbortSignal.timeout(SUGGESTION_BUDGET_MS),
): Promise<ArtistSuggestion[]> {
  const query = normaliseQuery(rawQuery);
  if (query.length < MIN_SUGGESTION_QUERY_LENGTH || query.length > MAX_SUGGESTION_QUERY_LENGTH) {
    return [];
  }

  try {
    const res = await musicBrainzFetch(suggestionPath(query), budgetSignal, {
      maxQueueMs: MAX_QUEUE_MS,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'artist suggestions failed');
      return [];
    }
    const data = (await res.json()) as { readonly artists?: readonly MusicBrainzArtist[] };
    return toSuggestions(data.artists ?? []);
  } catch (error) {
    // A busy line is expected while essentials are being looked up, so it isn't worth a line.
    if (!(error instanceof MusicBrainzBusyError)) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'artist suggestions failed',
      );
    }
    return [];
  }
}
