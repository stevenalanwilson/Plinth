import { joinNames } from './listText';

/** The server's limit on a vibe, in characters. */
export const MAX_VIBE_LENGTH = 300;

// More than any list holds, so a request can't carry a crowd.
const MAX_ALBUMS = 10;
const PREFIX = 'Albums in the spirit of ';
// Tried in turn until the sentence fits, so a long title is cut before it is left out.
const TITLE_LENGTHS = [Number.POSITIVE_INFINITY, 60, 40, 24];

interface NamedAlbum {
  readonly artist: string;
  readonly album: string;
}

/** Navigation state that asks the Discover page to start a pick like these albums. */
export interface LikeTheseState {
  readonly likeThese: readonly NamedAlbum[];
}

export function likeTheseState(albums: readonly NamedAlbum[]): LikeTheseState {
  return { likeThese: albums.map(({ artist, album }) => ({ artist, album })) };
}

function isNamedAlbum(value: unknown): value is NamedAlbum {
  if (typeof value !== 'object' || value === null) return false;
  const { artist, album } = value as Record<string, unknown>;
  return typeof artist === 'string' && !!artist && typeof album === 'string' && !!album;
}

function shorten(text: string, length: number): string {
  return text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;
}

/** The vibe asked for in navigation state, or null if there isn't a valid one. */
export function vibeFromState(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('likeThese' in state)) return null;
  const { likeThese } = state as { likeThese: unknown };
  if (!Array.isArray(likeThese) || likeThese.length === 0 || likeThese.length > MAX_ALBUMS) {
    return null;
  }
  if (!likeThese.every(isNamedAlbum)) return null;

  for (const length of TITLE_LENGTHS) {
    const vibe = `${PREFIX}${joinNames(likeThese.map((a) => `${shorten(a.album, length)} by ${a.artist}`))}`;
    if (vibe.length <= MAX_VIBE_LENGTH) return vibe;
  }
  // The artists alone say most of it, and always fit.
  const artists = [...new Set(likeThese.map((a) => a.artist))];
  return shorten(`${PREFIX}${joinNames(artists)}`, MAX_VIBE_LENGTH);
}

/** Navigation state that asks the home page to open the top 3 builder. */
export interface OpenTopThreeState {
  readonly openTopThree: true;
}

export function openTopThreeState(): OpenTopThreeState {
  return { openTopThree: true };
}

/** The page asked for in navigation state, or null if there isn't a valid request. */
export function pageFromState(state: unknown): 'top3' | null {
  const isRequested =
    typeof state === 'object' &&
    state !== null &&
    (state as { openTopThree?: unknown }).openTopThree === true;
  return isRequested ? 'top3' : null;
}
