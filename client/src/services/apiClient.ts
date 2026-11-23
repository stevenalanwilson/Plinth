import {
  AccountResponse,
  AccountStatusResponse,
  AlbumSearchResponse,
  ArtistSuggestionsResponse,
  DeviceRegistrationResponse,
  IDEMPOTENCY_KEY_HEADER,
  LibrarySyncRequest,
  LibrarySyncResponse,
  ListKind,
  ListQualifier,
  ListResponse,
  ListsResponse,
  AlbumDetailsResponse,
  AlbumResponse,
  RecommendationRequest,
  RecommendationResponse,
  ArtworkResponse,
  ArtistRelationsResponse,
  ArtistEssentialsResponse,
} from '@shared/types';
import { clearDeviceToken, ensureDeviceToken, getStoredToken } from './deviceToken';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const API_V1 = '/api/v1';

/** A failed API call, with the HTTP status so callers can tell "not found" from "try later". */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** A machine-readable reason, when the server gave one. */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The request never got an answer: the connection dropped, or it took too long. */
class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionError';
  }
}

function isConnectionFailure(error: unknown): boolean {
  // fetch rejects with a TypeError when it can't reach the server at all.
  return error instanceof ConnectionError || error instanceof TypeError;
}

async function toApiError(res: Response): Promise<ApiError> {
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  return new ApiError(
    data.error ?? `Request failed with status ${res.status}`,
    res.status,
    data.code,
  );
}
const REQUEST_TIMEOUT_MS = 30_000;
// Long enough for a connection that is coming back (a phone changing network) to be there again.
const RETRY_DELAY_MS = 1_000;

async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  externalSignal?: AbortSignal,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  // Combined by hand: AbortSignal.any needs Safari 17.4 and AbortSignal.timeout Safari 16.4,
  // and a shared album link may well be opened on an older iPhone.
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  const timeoutId = setTimeout(cancel, timeoutMs);
  if (externalSignal?.aborted) cancel();
  else externalSignal?.addEventListener('abort', cancel, { once: true });

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (externalSignal?.aborted) throw err; // propagate cancellation as-is
      throw new ConnectionError('Request timed out. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', cancel);
  }
}

/** Waits, but stops at once with an AbortError if the caller cancels. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const finish = (): void => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    };
    const cancel = (): void => {
      clearTimeout(timeoutId);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timeoutId = setTimeout(finish, ms);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

/** Asks the server for this device's token. Sent without one, so a stale token can't block it. */
async function registerDevice(): Promise<string> {
  const res = await fetchWithTimeout(`${API_BASE}${API_V1}/devices`, { method: 'POST' });
  if (!res.ok) throw await toApiError(res);
  return ((await res.json()) as DeviceRegistrationResponse).token;
}

interface PostOptions {
  /** Marks the request as safe to repeat: it is retried once if the connection fails. */
  readonly idempotencyKey?: string;
  /** How long to wait for the answer, where the usual wait is too short for this request. */
  readonly timeoutMs?: number;
}

/**
 * Posts as this device. The first costly request asks the server for a token, and every one after
 * carries it, so the server can tell one device from another without an account. Requests that
 * only read, and are cached or cheap, don't carry it.
 */
async function sendAsDevice<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  signal?: AbortSignal,
  { idempotencyKey, timeoutMs }: PostOptions = {},
): Promise<T> {
  const sendOnce = (token: string | null): Promise<Response> =>
    fetchWithTimeout(
      `${API_BASE}${path}`,
      {
        method,
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(idempotencyKey ? { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      signal,
      timeoutMs,
    );

  // With a key, the server answers a repeat from the first result, so trying again after the
  // connection drops can't cost a second pick. Without one a repeat could, so it isn't done.
  const send = idempotencyKey
    ? async (token: string | null): Promise<Response> => {
        try {
          return await sendOnce(token);
        } catch (error) {
          if (!isConnectionFailure(error)) throw error;
          await pause(RETRY_DELAY_MS, signal);
          return sendOnce(token);
        }
      }
    : sendOnce;

  const token = await ensureDeviceToken(registerDevice);
  let res = await send(token);

  // 401 means the server doesn't know the token (it expired, or the database was reset): get a
  // new one and try once more, not forever.
  if (res.status === 401 && token) {
    clearDeviceToken();
    res = await send(await ensureDeviceToken(registerDevice));
  }

  if (!res.ok) throw await toApiError(res);

  // Nothing comes back from signing out or deleting an account.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function post<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
  options?: PostOptions,
): Promise<T> {
  return sendAsDevice<T>('POST', path, body, signal, options);
}

async function get<T>(
  path: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const res = await fetchWithTimeout(
    `${API_BASE}${path}${query ? `?${query}` : ''}`,
    undefined,
    signal,
  );

  if (!res.ok) throw await toApiError(res);

  return res.json() as Promise<T>;
}

export function fetchRecommendation(
  request: RecommendationRequest,
  signal?: AbortSignal,
): Promise<RecommendationResponse> {
  // A new key for each pick, shared by the retry of that pick and by nothing else.
  return post<RecommendationResponse>(`${API_V1}/recommend`, request, signal, {
    idempotencyKey: crypto.randomUUID(),
  });
}

export function fetchArtwork(
  artist: string,
  album: string,
  releaseGroupId?: string,
): Promise<ArtworkResponse> {
  return get<ArtworkResponse>(`${API_V1}/artwork`, {
    artist,
    album,
    ...(releaseGroupId ? { releaseGroupId } : {}),
  });
}

export function fetchAlbum(slug: string, signal?: AbortSignal): Promise<AlbumResponse> {
  return get<AlbumResponse>(`${API_V1}/albums/${encodeURIComponent(slug)}`, {}, signal);
}

export function fetchAlbumDetails(
  slug: string,
  signal?: AbortSignal,
): Promise<AlbumDetailsResponse> {
  return get<AlbumDetailsResponse>(
    `${API_V1}/albums/${encodeURIComponent(slug)}/details`,
    {},
    signal,
  );
}

/**
 * Artwork for a pick: from its stored album when it has a slug, otherwise looked up by name
 * (and release group, when the pick was matched).
 */
export async function fetchRecommendationArtwork(
  recommendation: RecommendationResponse,
): Promise<ArtworkResponse> {
  const { artist, album, releaseGroupId, slug } = recommendation;
  if (slug) {
    try {
      const stored = await fetchAlbum(slug);
      return {
        artworkUrl: stored.artworkUrl,
        year: stored.year,
        appleMusicUrl: stored.appleMusicUrl,
      };
    } catch (error) {
      // A slug only disappears where albums live in memory (local dev without a database), so
      // fall back for that, but not for errors like rate limits that a retry would only repeat.
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
  }
  return fetchArtwork(artist, album, releaseGroupId);
}

export function fetchArtistRelations(artist: string): Promise<ArtistRelationsResponse> {
  return get<ArtistRelationsResponse>(`${API_V1}/artist-rels`, { artist });
}

// An artist's essentials take a Claude answer and a lookup of each related album, which can come
// to well over the usual wait. The server keeps what it works out, so this is only the first time.
const ESSENTIALS_TIMEOUT_MS = 60_000;

/** An artist picked from the suggestions, which says which of several with the name is meant. */
export interface ArtistChoice {
  readonly id: string;
  readonly detail: string;
}

export function fetchArtistEssentials(
  artist: string,
  signal?: AbortSignal,
  choice?: ArtistChoice,
): Promise<ArtistEssentialsResponse> {
  const body = {
    artist,
    ...(choice ? { artistId: choice.id } : {}),
    ...(choice?.detail ? { detail: choice.detail } : {}),
  };
  return post<ArtistEssentialsResponse>(`${API_V1}/artist-essentials`, body, signal, {
    timeoutMs: ESSENTIALS_TIMEOUT_MS,
  });
}

/** Artists whose names start with what has been typed. */
export function fetchArtistSuggestions(
  query: string,
  signal?: AbortSignal,
): Promise<ArtistSuggestionsResponse> {
  return get<ArtistSuggestionsResponse>(`${API_V1}/artist-suggestions`, { q: query }, signal);
}

/** Albums whose title or artist matches what has been typed, best match first. */
export function searchAlbums(query: string, signal?: AbortSignal): Promise<AlbumSearchResponse> {
  return get<AlbumSearchResponse>(`${API_V1}/albums/search`, { q: query }, signal);
}

/**
 * The lists this device, or the account it is signed in to, has made. A browser with no device
 * token has made none, so it is not asked to get one just to find that out.
 */
export async function fetchOwnLists(signal?: AbortSignal): Promise<ListsResponse> {
  const token = getStoredToken();
  if (!token) return { lists: [] };

  const res = await fetchWithTimeout(
    `${API_BASE}${API_V1}/lists`,
    { headers: { Authorization: `Bearer ${token}` } },
    signal,
  );
  if (res.status === 401) {
    // The server doesn't know this token, so it has made no lists. It gets a new one when it
    // next makes a request that needs one.
    clearDeviceToken();
    return { lists: [] };
  }
  if (!res.ok) throw await toApiError(res);
  return res.json() as Promise<ListsResponse>;
}

export interface NewListRequest {
  readonly kind: ListKind;
  readonly qualifier: ListQualifier;
  /** MusicBrainz release group IDs, best first. */
  readonly releaseGroupIds: readonly string[];
}

/** Makes this device's list. Fails with status 409 if it already has one of this kind. */
export function createList(request: NewListRequest, signal?: AbortSignal): Promise<ListResponse> {
  return post<ListResponse>(`${API_V1}/lists`, request, signal);
}

/** Puts these albums, in this order, in the list, replacing what it held. */
export function replaceList(
  id: string,
  releaseGroupIds: readonly string[],
  signal?: AbortSignal,
): Promise<ListResponse> {
  return sendAsDevice<ListResponse>(
    'PUT',
    `${API_V1}/lists/${encodeURIComponent(id)}`,
    { releaseGroupIds },
    signal,
  );
}

export async function deleteList(id: string, signal?: AbortSignal): Promise<void> {
  await sendAsDevice<void>(
    'DELETE',
    `${API_V1}/lists/${encodeURIComponent(id)}`,
    undefined,
    signal,
  );
}

/** Emails a one-use sign-in link to the address. */
export async function requestSignInLink(email: string, signal?: AbortSignal): Promise<void> {
  await post<unknown>(`${API_V1}/auth/sign-in`, { email }, signal);
}

/** Signs this browser in with the token from a sign-in link. */
export function verifySignIn(token: string, signal?: AbortSignal): Promise<AccountResponse> {
  return post<AccountResponse>(`${API_V1}/auth/verify`, { token }, signal);
}

/**
 * Who this browser is signed in as. A browser with no device token can't be signed in, so it is
 * not asked to get one just to find that out: unlike the other reads, this one carries the token.
 */
export async function fetchAccount(signal?: AbortSignal): Promise<AccountStatusResponse> {
  const token = getStoredToken();
  if (!token) return { account: null };

  const res = await fetchWithTimeout(
    `${API_BASE}${API_V1}/auth/me`,
    { headers: { Authorization: `Bearer ${token}` } },
    signal,
  );
  if (res.status === 401) {
    // The server doesn't know this token, so it can't be signed in. It gets a new one when it
    // next makes a request that needs one.
    clearDeviceToken();
    return { account: null };
  }
  if (!res.ok) throw await toApiError(res);
  return res.json() as Promise<AccountStatusResponse>;
}

export async function signOut(signal?: AbortSignal): Promise<void> {
  await post<void>(`${API_V1}/auth/sign-out`, undefined, signal);
}

/** Deletes the account this browser is signed in to, and signs every device out of it. */
export async function deleteAccount(signal?: AbortSignal): Promise<void> {
  await sendAsDevice<void>('DELETE', `${API_V1}/auth/account`, undefined, signal);
}

/**
 * Saves this device's changes to the signed-in account's crate and returns what the account has
 * changed since the device last heard. Safe to repeat, so there's no key and no retry here: the
 * caller just asks again later.
 */
export function syncLibrary(
  request: LibrarySyncRequest,
  signal?: AbortSignal,
): Promise<LibrarySyncResponse> {
  return post<LibrarySyncResponse>(`${API_V1}/library/sync`, request, signal);
}

export function getProxiedArtworkUrl(artworkUrl: string): string {
  return `${API_BASE}${API_V1}/image?url=${encodeURIComponent(artworkUrl)}`;
}

export function buildAppleMusicSearchUrl(artist: string, album: string): string {
  return `https://music.apple.com/gb/search?term=${encodeURIComponent(`${artist} ${album}`)}`;
}

export function buildSpotifySearchUrl(artist: string, album: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${album}`)}`;
}

export function buildDiscogsSearchUrl(artist: string, album: string): string {
  return `https://www.discogs.com/search/?q=${encodeURIComponent(`${artist} ${album}`)}&type=release`;
}
