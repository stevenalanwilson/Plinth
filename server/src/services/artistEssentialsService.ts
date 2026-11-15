import { ArtistEssentialsRequest, ArtistEssentialsResponse, EssentialAlbum } from '@shared/types';
import { completeJson } from '../repositories/claudeClient';
import { logger } from '../logger';
import { normaliseName } from '../utils/musicNames';
import {
  ArtistAlbumsLookup,
  findArtistAlbums,
  ReleaseGroupCandidate,
  selectAlbumMatch,
} from './albumMatchService';

const SYSTEM_PROMPT =
  'You are a music expert with encyclopaedic knowledge of albums across all genres. ' +
  'Only list albums you have complete certainty exist as real, released recordings. ' +
  'Never invent or fabricate an artist or album title — if you are not certain an album exists, choose a different one you are sure about. ' +
  'Respond only with valid JSON — no markdown, no prose, nothing else.';

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
      ? `\n\nMusicBrainz lists these albums by ${artist}; choose from them: ${correction.knownAlbums.join(', ')}`
      : '';
  return `${notFound}${known}`;
}

export function buildPrompt(artist: string, correction?: EssentialsCorrection): string {
  return `List 5 to 8 essential albums by ${artist} that a new listener should explore. Order them in the way you'd recommend a newcomer to listen through the catalogue — whether that means chronologically, by accessibility, or by importance.

Each album must be a real, verifiably released studio or live album by ${artist}. Do not invent titles.${correctionText(artist, correction)}

Respond with ONLY this JSON:
{
  "artist": "Canonical Artist Name",
  "albums": [
    { "album": "Album Title", "year": "YYYY", "reason": "One or two sentences on why this album is essential." }
  ]
}`;
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

  const albums: EssentialAlbum[] = (data.albums as unknown[])
    .slice(0, 8)
    .map((item: unknown, index: number) => {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`Album at index ${index} is not an object`);
      }
      const entry = item as Record<string, unknown>;

      // Coerce numeric year to string — LLMs occasionally omit the quotes around a year value.
      if (typeof entry.year === 'number') {
        entry.year = String(entry.year);
      }

      if (
        typeof entry.album !== 'string' ||
        typeof entry.year !== 'string' ||
        typeof entry.reason !== 'string'
      ) {
        throw new Error(`Album at index ${index} has invalid field types`);
      }

      return { album: entry.album, year: entry.year, reason: entry.reason };
    });

  return { artist: data.artist, albums };
}

// Structured outputs support only a subset of JSON Schema, so the 5-8 album bound stays
// out of the schema: the prompt asks for it and toArtistEssentials enforces it.
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
  },
  required: ['artist', 'albums'],
  additionalProperties: false,
} as const;

async function requestEssentials(
  artist: string,
  correction?: EssentialsCorrection,
): Promise<ArtistEssentialsResponse> {
  const parsed = await completeJson({
    label: 'artist-essentials',
    schema: ESSENTIALS_SCHEMA,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(artist, correction),
    maxTokens: 2000,
    timeoutMs: 20_000,
  });
  return toArtistEssentials(parsed);
}

const MIN_VERIFIED_ALBUMS = 3;
const MAX_KNOWN_ALBUMS = 60;

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

/** Keeps only albums found in the artist's MusicBrainz catalogue, in Claude's order. */
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

  return { essentials: { artist, albums }, notFound };
}

function studioAlbumTitles(catalogue: readonly ReleaseGroupCandidate[]): string[] {
  return catalogue
    .filter((candidate) => (candidate['secondary-types']?.length ?? 0) === 0)
    .map((candidate) => candidate.title)
    .slice(0, MAX_KNOWN_ALBUMS);
}

async function lookUpCatalogue(
  requestedArtist: string,
  claudeArtist: string,
  pending: Promise<ArtistAlbumsLookup>,
): Promise<ArtistAlbumsLookup> {
  const lookup = await pending;
  // Claude corrects typos in the typed name, so its spelling is worth a second try.
  if (
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

export async function getArtistEssentials(
  request: ArtistEssentialsRequest,
): Promise<ArtistEssentialsResponse> {
  // The MusicBrainz lookup only needs the typed name, so it runs while Claude answers.
  const pendingCatalogue = findArtistAlbums(request.artist);
  const first = await requestEssentials(request.artist);
  const lookup = await lookUpCatalogue(request.artist, first.artist, pendingCatalogue);

  // Better an unchecked list than none at all while MusicBrainz is down.
  if (lookup.status === 'lookup_failed') return first;
  if (lookup.status === 'not_found') throw new UnverifiedEssentialsError();

  let result = verifyEssentials(first, lookup.artist, lookup.albums);
  logVerification(lookup.artist, 1, result);

  if (result.essentials.albums.length < MIN_VERIFIED_ALBUMS) {
    const retry = verifyEssentials(
      await requestEssentials(lookup.artist, {
        notFound: result.notFound,
        knownAlbums: studioAlbumTitles(lookup.albums),
      }),
      lookup.artist,
      lookup.albums,
    );
    logVerification(lookup.artist, 2, retry);
    if (retry.essentials.albums.length > result.essentials.albums.length) result = retry;
  }

  if (result.essentials.albums.length === 0) throw new UnverifiedEssentialsError();
  return result.essentials;
}
