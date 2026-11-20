import {
  ArtistEssentialsRequest,
  ArtistEssentialsResponse,
  EssentialAlbum,
  ConnectedAlbum,
} from '@shared/types';
import { completeJson } from '../repositories/claudeClient';
import { logger } from '../logger';
import { artistsMatch, normaliseName } from '../utils/musicNames';
import { readCache, writeCache } from '../repositories/lookupCache';
import {
  AlbumLookup,
  ArtistAlbumsLookup,
  findAlbum,
  findArtistAlbums,
  findArtistAlbumsById,
  ReleaseGroupCandidate,
  selectAlbumMatch,
} from './albumMatchService';

const SYSTEM_PROMPT =
  'You are a music expert with encyclopaedic knowledge of albums across all genres. ' +
  'Only list albums you have complete certainty exist as real, released recordings. ' +
  'Never invent or fabricate an artist or album title — if you are not certain an album exists, choose a different one you are sure about. ' +
  'Respond only with valid JSON — no markdown, no prose, nothing else.';

const MAX_OWN_ALBUMS = 3;
const MAX_RELATED_ALBUMS = 8;

/** Albums from an earlier answer that MusicBrainz didn't have, plus the titles it does have. */
export interface EssentialsCorrection {
  readonly notFound: readonly string[];
  readonly knownAlbums: readonly string[];
}

function correctionText(artist: string, correction: EssentialsCorrection | undefined): string {
  if (!correction) return '';
  const notFound =
    correction.notFound.length > 0
      ? `\n\nThese albums could not be found in MusicBrainz, so they may not exist — do NOT list them: ${correction.notFound.join(', ')}`
      : '';
  const known =
    correction.knownAlbums.length > 0
      ? `\n\nMusicBrainz lists these albums by ${artist}; choose the albums to start with from them: ${correction.knownAlbums.join(', ')}`
      : '';
  return `${notFound}${known}`;
}

/**
 * `detail` says which artist is meant when several share the name, such as "60s band from the
 * UK", and is given wherever the prompt first names them.
 */
export function buildPrompt(
  artist: string,
  correction?: EssentialsCorrection,
  detail?: string,
): string {
  const who = detail ? `${artist} (${detail})` : artist;
  return `Someone loves ${who} and wants to know what to listen to next. Give them two lists.

1. "albums": the two or three albums by ${who} a newcomer should start with, in the order to listen to them. Each must be a real, verifiably released studio or live album by ${artist}.

2. "related": five to seven essential albums by OTHER artists who are closely connected to ${artist}. Only include people with a direct connection to ${artist}: members, past or present, and their solo albums and other bands; side projects; frequent collaborators and guest musicians; and the producers and engineers who made ${artist}'s records, where that person made records of their own. Do not include labelmates, contemporaries, touring partners or artists who merely sound similar. Never include an album by ${artist}. Take no more than two albums from any one of them. For each, say who made it, and in "connection" say in a few words how they are connected to ${artist} (for example "Guitarist's solo debut" or "Produced by Steve Albini").

Keep every reason to one short sentence. Do not invent titles.${correctionText(artist, correction)}

Respond with ONLY this JSON:
{
  "artist": "Canonical Artist Name",
  "albums": [
    { "album": "Album Title", "year": "YYYY", "reason": "One short sentence on why to start here." }
  ],
  "related": [
    { "artist": "Connected Artist", "album": "Album Title", "year": "YYYY", "connection": "How they are connected to ${artist}", "reason": "One short sentence on why this album is essential." }
  ]
}`;
}

function coerceYear(entry: Record<string, unknown>): void {
  // LLMs occasionally omit the quotes around a year value.
  if (typeof entry.year === 'number') entry.year = String(entry.year);
}

function toOwnAlbum(item: unknown, index: number): EssentialAlbum {
  if (typeof item !== 'object' || item === null) {
    throw new Error(`Album at index ${index} is not an object`);
  }
  const entry = item as Record<string, unknown>;
  coerceYear(entry);
  if (
    typeof entry.album !== 'string' ||
    typeof entry.year !== 'string' ||
    typeof entry.reason !== 'string'
  ) {
    throw new Error(`Album at index ${index} has invalid field types`);
  }
  return { album: entry.album, year: entry.year, reason: entry.reason };
}

/** A related album that isn't well formed is left out, not a reason to lose the whole answer. */
function toConnectedAlbum(item: unknown): ConnectedAlbum | null {
  if (typeof item !== 'object' || item === null) return null;
  const entry = item as Record<string, unknown>;
  coerceYear(entry);
  if (
    typeof entry.artist !== 'string' ||
    entry.artist.trim() === '' ||
    typeof entry.album !== 'string' ||
    typeof entry.year !== 'string' ||
    typeof entry.reason !== 'string' ||
    typeof entry.connection !== 'string'
  ) {
    return null;
  }
  return {
    artist: entry.artist,
    album: entry.album,
    year: entry.year,
    connection: entry.connection,
    reason: entry.reason,
  };
}

export function toArtistEssentials(parsed: unknown): ArtistEssentialsResponse {
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('artist' in parsed) ||
    !('albums' in parsed)
  ) {
    throw new Error('Incomplete essentials data');
  }

  const data = parsed as Record<string, unknown>;

  if (typeof data.artist !== 'string' || data.artist.trim() === '') {
    throw new Error('Invalid artist field in essentials response');
  }

  if (!Array.isArray(data.albums) || data.albums.length === 0) {
    throw new Error('albums must be a non-empty array');
  }

  const albums = (data.albums as unknown[]).slice(0, MAX_OWN_ALBUMS).map(toOwnAlbum);
  const related = Array.isArray(data.related)
    ? (data.related as unknown[])
        .map(toConnectedAlbum)
        .filter((album): album is ConnectedAlbum => album !== null)
        .slice(0, MAX_RELATED_ALBUMS)
    : [];

  return { artist: data.artist, albums, related };
}

// Structured outputs support only a subset of JSON Schema, so the counts stay out of the schema:
// the prompt asks for them and toArtistEssentials enforces them.
const ESSENTIALS_SCHEMA = {
  type: 'object',
  properties: {
    artist: { type: 'string' },
    albums: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          album: { type: 'string' },
          year: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['album', 'year', 'reason'],
        additionalProperties: false,
      },
    },
    related: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          artist: { type: 'string' },
          album: { type: 'string' },
          year: { type: 'string' },
          connection: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['artist', 'album', 'year', 'connection', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['artist', 'albums', 'related'],
  additionalProperties: false,
} as const;

async function requestEssentials(
  artist: string,
  correction?: EssentialsCorrection,
  detail?: string,
): Promise<ArtistEssentialsResponse> {
  const parsed = await completeJson({
    label: 'artist-essentials',
    schema: ESSENTIALS_SCHEMA,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(artist, correction, detail),
    maxTokens: 3000,
    timeoutMs: 25_000,
  });
  return toArtistEssentials(parsed);
}

const MIN_VERIFIED_ALBUMS = 2;
const MAX_KNOWN_ALBUMS = 60;
// All the related albums are looked up together, one MusicBrainz request a second, so this is
// time for about a dozen of them.
const RELATED_LOOKUP_BUDGET_MS = 14_000;

export class UnverifiedEssentialsError extends Error {
  constructor() {
    super('No essential albums could be verified in MusicBrainz');
    this.name = 'UnverifiedEssentialsError';
  }
}

interface VerifiedEssentials {
  readonly essentials: ArtistEssentialsResponse;
  readonly notFound: readonly string[];
}

/**
 * Keeps only the artist's own albums that are in their MusicBrainz catalogue, in Claude's order.
 * The related albums are carried through as they are: they belong to other artists, so they are
 * checked on their own by verifyRelated.
 */
export function verifyEssentials(
  essentials: ArtistEssentialsResponse,
  artist: string,
  catalogue: readonly ReleaseGroupCandidate[],
): VerifiedEssentials {
  const albums: EssentialAlbum[] = [];
  const notFound: string[] = [];

  for (const entry of essentials.albums) {
    const match = selectAlbumMatch(catalogue, { artist, album: entry.album, year: entry.year });
    if (!match) {
      notFound.push(entry.album);
      continue;
    }
    if (albums.some((album) => album.releaseGroupId === match.releaseGroupId)) continue;
    albums.push({
      album: match.album,
      year: match.year ?? entry.year,
      reason: entry.reason,
      releaseGroupId: match.releaseGroupId,
    });
  }

  return { essentials: { artist, albums, related: essentials.related }, notFound };
}

interface VerifiedRelated {
  readonly related: readonly ConnectedAlbum[];
  /** True when some could not be looked up, so the list went out partly unchecked. */
  readonly isUnchecked: boolean;
}

function toVerifiedRelated(
  entry: ConnectedAlbum,
  lookup: AlbumLookup,
): { readonly album: ConnectedAlbum | null; readonly isUnchecked: boolean } {
  if (lookup.status === 'not_found') return { album: null, isUnchecked: false };
  // Better an album that couldn't be checked than none while MusicBrainz is struggling.
  if (lookup.status === 'lookup_failed') return { album: entry, isUnchecked: true };
  const { match } = lookup;
  return {
    album: {
      artist: match.artist,
      album: match.album,
      year: match.year ?? entry.year,
      connection: entry.connection,
      reason: entry.reason,
      releaseGroupId: match.releaseGroupId,
    },
    isUnchecked: false,
  };
}

/**
 * Keeps the related albums MusicBrainz knows, with its spellings and years, in Claude's order.
 * An album by the artist searched for is dropped, since this list is for what else to hear.
 */
export async function verifyRelated(
  related: readonly ConnectedAlbum[],
  artist: string,
): Promise<VerifiedRelated> {
  const budget = AbortSignal.timeout(RELATED_LOOKUP_BUDGET_MS);
  const lookups = await Promise.all(
    related.map((entry) =>
      findAlbum({ artist: entry.artist, album: entry.album, year: entry.year }, budget),
    ),
  );

  const kept: ConnectedAlbum[] = [];
  let isUnchecked = false;
  related.forEach((entry, index) => {
    const result = toVerifiedRelated(entry, lookups[index]);
    if (result.isUnchecked) isUnchecked = true;
    const { album } = result;
    if (!album || artistsMatch(artist, album.artist)) return;
    const isRepeat = kept.some((other) =>
      album.releaseGroupId !== undefined
        ? other.releaseGroupId === album.releaseGroupId
        : normaliseName(other.album) === normaliseName(album.album) &&
          normaliseName(other.artist) === normaliseName(album.artist),
    );
    if (!isRepeat) kept.push(album);
  });

  return { related: kept, isUnchecked };
}

function isStudioAlbum(candidate: ReleaseGroupCandidate): boolean {
  return (candidate['secondary-types']?.length ?? 0) === 0;
}

/**
 * True unless MusicBrainz leaves the album off the artist's page, as it does for an archive
 * tape that only came out as a bootleg. Without the listed IDs, nothing is left out.
 */
function isListed(
  candidate: ReleaseGroupCandidate,
  listedIds: ReadonlySet<string> | null,
): boolean {
  return listedIds?.has(candidate.id) ?? true;
}

function studioAlbumTitles(
  catalogue: readonly ReleaseGroupCandidate[],
  listedIds: ReadonlySet<string> | null,
): string[] {
  return catalogue
    .filter((candidate) => isStudioAlbum(candidate) && isListed(candidate, listedIds))
    .map((candidate) => candidate.title)
    .slice(0, MAX_KNOWN_ALBUMS);
}

async function lookUpCatalogue(
  requestedArtist: string,
  claudeArtist: string,
  pending: Promise<ArtistAlbumsLookup>,
  isChosenById: boolean,
): Promise<ArtistAlbumsLookup> {
  const lookup = await pending;
  // Claude corrects typos in the typed name, so its spelling is worth a second try. Not for an
  // artist chosen from the suggestions, whose name was never typed.
  if (
    !isChosenById &&
    lookup.status === 'not_found' &&
    normaliseName(claudeArtist) !== normaliseName(requestedArtist)
  ) {
    return findArtistAlbums(claudeArtist);
  }
  return lookup;
}

function logVerification(artist: string, attempt: number, result: VerifiedEssentials): void {
  logger.info(
    {
      artist,
      attempt,
      verified: result.essentials.albums.length,
      notFound: result.notFound,
    },
    'essentials verified',
  );
}

// A list takes Claude calls and a dozen MusicBrainz lookups to make, and an artist's essential
// albums don't change, so a verified list keeps for a month.
const ESSENTIALS_CACHE_SECONDS = 30 * 24 * 60 * 60;
// Bump when ArtistEssentialsResponse changes shape or what goes into it, so entries from before
// are left behind. v4: the rest of the artist's albums became related albums by other artists.
const ESSENTIALS_CACHE_VERSION = 'v4';

function isVerifiedAlbum(entry: unknown): boolean {
  if (typeof entry !== 'object' || entry === null) return false;
  const album = entry as EssentialAlbum;
  return (
    typeof album.album === 'string' &&
    typeof album.year === 'string' &&
    typeof album.reason === 'string' &&
    typeof album.releaseGroupId === 'string'
  );
}

function isVerifiedRelated(entry: unknown): boolean {
  if (!isVerifiedAlbum(entry)) return false;
  const album = entry as ConnectedAlbum;
  return typeof album.artist === 'string' && typeof album.connection === 'string';
}

/**
 * True for a list where every album was matched in MusicBrainz, and which has related albums:
 * the only kind worth keeping. A list with none may only mean the lookups missed.
 */
function isVerifiedEssentials(value: unknown): value is ArtistEssentialsResponse {
  if (typeof value !== 'object' || value === null) return false;
  const { artist, albums, related } = value as Partial<ArtistEssentialsResponse>;
  return (
    typeof artist === 'string' &&
    Array.isArray(albums) &&
    albums.length > 0 &&
    albums.every(isVerifiedAlbum) &&
    Array.isArray(related) &&
    related.length > 0 &&
    related.every(isVerifiedRelated)
  );
}

/**
 * Returns where to start with an artist and essential albums by people connected to them, from
 * the cache when a verified list is kept. A list that went out unchecked (MusicBrainz was down)
 * is never kept, so it can't outlive the outage.
 */
export async function getArtistEssentials(
  request: ArtistEssentialsRequest,
): Promise<ArtistEssentialsResponse> {
  // An artist chosen by ID is kept apart from one searched for by name: two artists can share
  // a name, and the name alone would give one of them the other's list.
  const key = request.artistId
    ? `${ESSENTIALS_CACHE_VERSION}:id:${request.artistId.toLowerCase()}`
    : `${ESSENTIALS_CACHE_VERSION}:${normaliseName(request.artist)}`;

  const cached = await readCache('essentials', key);
  if (isVerifiedEssentials(cached)) return cached;
  if (cached !== null) logger.warn({ key }, 'cached essentials discarded');

  const essentials = await buildEssentials(request);
  if (isVerifiedEssentials(essentials)) {
    await writeCache('essentials', key, essentials, ESSENTIALS_CACHE_SECONDS);
  }
  return essentials;
}

async function buildEssentials(
  request: ArtistEssentialsRequest,
): Promise<ArtistEssentialsResponse> {
  // The MusicBrainz lookup only needs the typed name, so it runs while Claude answers.
  const { artistId, detail } = request;
  const pendingCatalogue = artistId
    ? findArtistAlbumsById(artistId, request.artist)
    : findArtistAlbums(request.artist);
  const first = await requestEssentials(request.artist, undefined, detail);
  const lookup = await lookUpCatalogue(
    request.artist,
    first.artist,
    pendingCatalogue,
    artistId !== undefined,
  );

  // Better an unchecked list than none at all while MusicBrainz is down.
  if (lookup.status === 'lookup_failed') return first;
  if (lookup.status === 'not_found') throw new UnverifiedEssentialsError();

  let result = verifyEssentials(first, lookup.artist, lookup.albums);
  logVerification(lookup.artist, 1, result);

  if (result.essentials.albums.length < MIN_VERIFIED_ALBUMS) {
    const retry = verifyEssentials(
      await requestEssentials(
        lookup.artist,
        {
          notFound: result.notFound,
          knownAlbums: studioAlbumTitles(lookup.albums, lookup.listedIds),
        },
        detail,
      ),
      lookup.artist,
      lookup.albums,
    );
    logVerification(lookup.artist, 2, retry);
    if (retry.essentials.albums.length > result.essentials.albums.length) result = retry;
  }

  if (result.essentials.albums.length === 0) throw new UnverifiedEssentialsError();

  const verifiedRelated = await verifyRelated(result.essentials.related, lookup.artist);
  logger.info(
    {
      artist: lookup.artist,
      asked: result.essentials.related.length,
      kept: verifiedRelated.related.length,
      unchecked: verifiedRelated.isUnchecked,
    },
    'related albums verified',
  );
  return {
    artist: result.essentials.artist,
    albums: result.essentials.albums,
    related: verifiedRelated.related,
  };
}
