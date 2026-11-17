import {
  RecommendationRequest,
  RecommendationResponse,
  RecommendationPreferences,
  TasteHint,
} from '@shared/types';
import { completeJson } from '../repositories/claudeClient';
import { logger } from '../logger';
import { normaliseName } from '../utils/musicNames';
import { AlbumRepository } from '../repositories/albumRepository';
import { AlbumMatch, findAlbum } from './albumMatchService';
import { saveAlbum } from './albumService';
import { capHook } from '../utils/hookText';

const SYSTEM_PROMPT =
  'You are a music expert with encyclopaedic knowledge of albums across all genres. ' +
  'You make thoughtful, specific, personalised recommendations. ' +
  'Only recommend albums you have complete certainty exist as real, released recordings. ' +
  'Never invent or fabricate an artist or album title — if you are not certain an album exists, choose a different one you are sure about. ' +
  'Respond only with valid JSON — no markdown, no prose, nothing else.';

function thresholdLabel(value: number, low: string, mid: string, high: string): string {
  if (value <= 3) return low;
  if (value <= 7) return mid;
  return high;
}

function buildPreferencesSummary(preferences: RecommendationPreferences): string {
  const parts: string[] = [];

  if (preferences.genres.length > 0) {
    parts.push(`genres: ${preferences.genres.join(', ')}`);
  }

  if (preferences.moods.length > 0) {
    parts.push(`mood: ${preferences.moods.join(', ')}`);
  }

  parts.push(`tempo: ${thresholdLabel(preferences.tempo, 'slow', 'moderate', 'fast')}`);
  parts.push(`energy: ${thresholdLabel(preferences.energy, 'mellow', 'moderate', 'intense')}`);
  parts.push(`density: ${thresholdLabel(preferences.density, 'sparse', 'moderate', 'dense')}`);

  const eraLabel = preferences.era === 'any' ? 'any era' : `the ${preferences.era} era`;
  parts.push(`era: ${eraLabel}`);

  if (preferences.prioritiseObscure) {
    parts.push('strongly prefer lesser-known and underground artists over obvious choices');
  } else if (!preferences.includeFamiliarArtists) {
    parts.push('prefer less familiar artists');
  } else {
    parts.push('familiar and well-known artists are fine');
  }

  if (preferences.stayFocused) {
    parts.push('stay close to these stated preferences — do not stray into unrelated territory');
  }

  return parts.join('; ');
}

function formatAlbumList(albums: readonly string[]): string {
  return albums
    .map((s) => s.replace(/[\r\n]/g, ' '))
    .slice(0, 120)
    .join(', ');
}

/**
 * The albums the prompt tells Claude to avoid, with the ones the listener rated first: only the
 * first 120 reach Claude, and those are the ones that must never come back. Code checks the
 * full lists afterwards.
 */
function albumsToAvoid(request: RecommendationRequest): string[] {
  const seenKeys = new Set<string>();
  return [...(request.taste?.avoid ?? []), ...request.alreadySuggested].filter((album) => {
    const key = normaliseName(album);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}

function buildTasteStr(taste: TasteHint | undefined): string {
  if (!taste) return '';
  const parts: string[] = [];
  if (taste.liked.length > 0) {
    parts.push(
      `The listener owns, wants or has saved these albums, which show their taste: ${formatAlbumList(taste.liked)}. Lean gently towards that territory, but never recommend those exact albums.`,
    );
  }
  if (taste.disliked.length > 0) {
    parts.push(
      `The listener said these albums are not for them: ${formatAlbumList(taste.disliked)}. Steer away from albums like them.`,
    );
  }
  if (parts.length === 0) return '';
  parts.push(
    "Treat the listener's taste as a gentle lean only: their stated preferences, their vibe, and any artist or album the user asks for in this brief come first.",
  );
  return `\n\n${parts.join('\n\n')}`;
}

export function buildPrompt(
  request: RecommendationRequest,
  notFound: readonly string[] = [],
): string {
  const summary = buildPreferencesSummary(request.preferences);

  const toAvoid = albumsToAvoid(request);
  const avoidStr =
    toAvoid.length > 0
      ? `\n\nIMPORTANT — do NOT recommend any of these albums, which the listener has already been shown or has marked (format is "Artist – Album"): ${formatAlbumList(toAvoid)}`
      : '';

  const tasteStr = buildTasteStr(request.taste);

  const notFoundStr =
    notFound.length > 0
      ? `\n\nThese albums could not be found in MusicBrainz, so they may not exist — do NOT recommend them: ${formatAlbumList(notFound)}`
      : '';

  let pivotStr = '';
  if (request.pivot) {
    const ref = `"${request.pivot.artist} – ${request.pivot.album}"`;
    if (request.pivot.type === 'more-like-this') {
      pivotStr = `\n\nThe user enjoyed ${ref} and wants their next recommendation to be in a similar vein — comparable energy, style, mood, and era. Suggest something from a related scene or sound, but not the same artist.`;
    } else {
      pivotStr = `\n\nThe user was not satisfied with ${ref}. Recommend something meaningfully different — deliberately avoid similar genres, sounds, era, and mood.`;
    }
  }

  let seedStr = '';
  if (request.seedArtist) {
    seedStr = `\n\nThe user has discovered ${request.seedArtist} through an artist connection. Recommend a specific album by ${request.seedArtist} that fits their preferences. Do not suggest a different artist — the user specifically wants to explore ${request.seedArtist}'s catalogue.`;
  }

  let vibeStr = '';
  if (request.vibeQuery) {
    vibeStr = `\n\nThe user has described their vibe in their own words: "${request.vibeQuery}"\nTreat this as your primary creative brief — interpret it imaginatively. If it references a mashup of artists, styles, or moods, find a real album that captures that spirit.`;
  }

  return `Recommend ONE album for someone with the following preferences: ${summary}.${vibeStr}

Pick something genuinely interesting — a deep cut or overlooked gem rather than an obvious classic. It must be a real, released album.${avoidStr}${tasteStr}${notFoundStr}${pivotStr}${seedStr}

Respond with ONLY this JSON:
{
  "artist": "Artist Name",
  "album": "Album Title",
  "year": "YYYY",
  "reason": "Two sentences on why this fits their preferences.",
  "hook": "One short sentence, 20 words at most, on what makes the album itself worth hearing, without mentioning the listener or their preferences.",
  "genres": ["Primary Genre", "Secondary Genre"],
  "country": "Country of Origin"
}`;
}

function toRecommendation(parsed: unknown): RecommendationResponse {
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('artist' in parsed) ||
    !('album' in parsed) ||
    !('year' in parsed) ||
    !('reason' in parsed)
  ) {
    throw new Error('Incomplete recommendation data');
  }

  const rec = parsed as Record<string, unknown>;

  // Coerce numeric year to string — LLMs occasionally omit the quotes around a year value.
  if (typeof rec.year === 'number') {
    rec.year = String(rec.year);
  }

  if (
    typeof rec.artist !== 'string' ||
    typeof rec.album !== 'string' ||
    typeof rec.year !== 'string' ||
    typeof rec.reason !== 'string'
  ) {
    throw new Error('Invalid recommendation field types');
  }

  const genres = Array.isArray(rec.genres)
    ? (rec.genres as unknown[]).filter((g): g is string => typeof g === 'string')
    : undefined;
  const country = typeof rec.country === 'string' ? rec.country : undefined;
  const hook = typeof rec.hook === 'string' ? capHook(rec.hook.trim()) : undefined;

  return {
    artist: rec.artist,
    album: rec.album,
    year: rec.year,
    reason: rec.reason,
    ...(genres !== undefined && genres.length > 0 ? { genres } : {}),
    ...(country !== undefined ? { country } : {}),
    ...(hook ? { hook } : {}),
  };
}

function albumKey(rec: RecommendationResponse): string {
  return `${rec.artist} – ${rec.album}`;
}

function isAmong(rec: RecommendationResponse, albums: readonly string[]): boolean {
  // History holds MusicBrainz spellings ("Gil Scott‐Heron") while Claude writes its own
  // ("Gil Scott-Heron"), so compare normalised names rather than raw strings.
  const key = normaliseName(albumKey(rec));
  return albums.some((s) => normaliseName(s) === key);
}

type MatchedRecommendation = RecommendationResponse & { readonly releaseGroupId: string };

function withMatch(rec: RecommendationResponse, match: AlbumMatch): MatchedRecommendation {
  // MusicBrainz spellings are canonical, and its first-release year beats Claude's guess.
  return {
    ...rec,
    artist: match.artist,
    album: match.album,
    year: match.year ?? rec.year,
    releaseGroupId: match.releaseGroupId,
  };
}

/** Gives a confirmed pick its permalink. A failed save costs the pick its slug, never the pick. */
async function withPermalink(
  rec: MatchedRecommendation,
  albums: AlbumRepository,
): Promise<RecommendationResponse> {
  try {
    const slug = await saveAlbum(albums, {
      releaseGroupId: rec.releaseGroupId,
      artist: rec.artist,
      album: rec.album,
      year: rec.year,
      hook: rec.hook ?? null,
      genres: rec.genres ?? [],
      country: rec.country ?? null,
    });
    return { ...rec, slug };
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        releaseGroupId: rec.releaseGroupId,
      },
      'album save failed',
    );
    return rec;
  }
}

/** Every pick Claude offered was an album the listener has already marked. */
export class NoFreshPickError extends Error {
  constructor() {
    super('Every pick was an album the listener has already marked');
    this.name = 'NoFreshPickError';
  }
}

export class UnverifiedRecommendationError extends Error {
  constructor() {
    super('No recommendation could be verified in MusicBrainz');
    this.name = 'UnverifiedRecommendationError';
  }
}

const RECOMMENDATION_SCHEMA = {
  type: 'object',
  properties: {
    artist: { type: 'string' },
    album: { type: 'string' },
    year: { type: 'string' },
    reason: { type: 'string' },
    hook: { type: 'string' },
    genres: { type: 'array', items: { type: 'string' } },
    country: { type: 'string' },
  },
  required: ['artist', 'album', 'year', 'reason', 'hook', 'genres', 'country'],
  additionalProperties: false,
} as const;

async function requestRecommendation(prompt: string): Promise<RecommendationResponse> {
  const parsed = await completeJson({
    label: 'recommendation',
    schema: RECOMMENDATION_SCHEMA,
    system: SYSTEM_PROMPT,
    prompt,
    maxTokens: 800,
    timeoutMs: 15_000,
  });
  return toRecommendation(parsed);
}

const MAX_ATTEMPTS = 3;

/**
 * Asks Claude for a pick and checks it exists in MusicBrainz, asking again (up to
 * MAX_ATTEMPTS calls) when the pick is a duplicate or can't be found. A confirmed pick is
 * saved to `albums` so it has a permalink.
 */
export async function getRecommendation(
  request: RecommendationRequest,
  albums: AlbumRepository,
): Promise<RecommendationResponse> {
  // Accumulate rejected picks across attempts so each retry prompt is stricter.
  const seen = [...request.alreadySuggested];
  const notFound: string[] = [];
  // Albums the listener has marked are never shown again. Ones merely seen before may be, as a
  // last resort, so that a listener who has seen nearly everything still gets an answer.
  const rated = request.taste?.avoid ?? [];
  let lastRepeat: RecommendationResponse | null = null;
  let lastRejection: 'rated' | 'not_found' | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const rec = await requestRecommendation(
      buildPrompt({ ...request, alreadySuggested: seen }, notFound),
    );

    // Checked first: a rated album is also in the history sent as alreadySuggested.
    if (isAmong(rec, rated)) {
      logger.info(
        { reason: 'rated', attempt, artist: rec.artist, album: rec.album },
        'recommendation regenerated',
      );
      lastRejection = 'rated';
      seen.push(albumKey(rec));
      continue;
    }

    if (isAmong(rec, request.alreadySuggested)) {
      logger.info(
        { reason: 'duplicate', attempt, artist: rec.artist, album: rec.album },
        'recommendation regenerated',
      );
      lastRepeat = rec;
      seen.push(albumKey(rec));
      continue;
    }

    const lookup = await findAlbum({ artist: rec.artist, album: rec.album, year: rec.year });
    if (lookup.status === 'matched') return withPermalink(withMatch(rec, lookup.match), albums);
    // Better an unchecked pick than no pick at all while MusicBrainz is down.
    if (lookup.status === 'lookup_failed') return rec;

    logger.info(
      { reason: 'not_found', attempt, artist: rec.artist, album: rec.album },
      'recommendation regenerated',
    );
    lastRejection = 'not_found';
    notFound.push(albumKey(rec));
  }

  // A repeat passed this check when it was first suggested, so it is still worth showing.
  if (lastRepeat) {
    logger.info({ artist: lastRepeat.artist, album: lastRepeat.album }, 'repeat pick shown');
    return lastRepeat;
  }
  if (lastRejection === 'rated') {
    logger.warn({ rated: true }, 'no fresh recommendation');
    throw new NoFreshPickError();
  }
  logger.warn({ notFound }, 'no verified recommendation');
  throw new UnverifiedRecommendationError();
}
