import { Request, Response } from 'express';
import {
  getRecommendation,
  NoFreshPickError,
  UnverifiedRecommendationError,
} from '../services/recommendationService';
import {
  RecommendationRequest,
  RecommendationPreferences,
  PivotHint,
  SLIDER_MIN,
  SLIDER_MAX,
  ERA_VALUES,
  MAX_PREFERENCE_ARRAY_LENGTH,
  MAX_TASTE_AVOID,
  MAX_TASTE_SAMPLE,
  IDEMPOTENCY_KEY_HEADER,
  MAX_VISIT_COUNT,
  RecommendationResponse,
  TasteHint,
  VISIT_ENTRIES,
  VisitEntry,
} from '@shared/types';
import { logger } from '../logger';
import { AlbumRepository } from '../repositories/albumRepository';
import { createIdempotencyCache, IdempotencyCache } from '../services/idempotencyCache';
import {
  DailyLimitError,
  DailyPickLimiter,
  secondsUntilNextDay,
  Visitor,
} from '../services/dailyLimitService';
import { deviceOf } from '../middleware/deviceAuth';

const VALID_ERAS = new Set<string>(ERA_VALUES);
// A random UUID made by the client for each pick; anything else is a bug worth saying so about.
const IDEMPOTENCY_KEY_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ALREADY_SUGGESTED = 150;
// Generous because real album titles can run to hundreds of characters; the point is to
// stop a single request stuffing a paid-for prompt with arbitrary text.
const MAX_NAME_LENGTH = 500;
// History entries are formatted client-side as "Artist – Album".
const MAX_SUGGESTION_LENGTH = MAX_NAME_LENGTH * 2 + ' – '.length;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= MAX_NAME_LENGTH;
}

function isAlbumList(value: unknown, maxLength: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxLength &&
    value.every((item) => typeof item === 'string' && item.length <= MAX_SUGGESTION_LENGTH)
  );
}

function isValidAlreadySuggested(value: unknown): value is string[] {
  return isAlbumList(value, MAX_ALREADY_SUGGESTED);
}

function isValidTaste(value: unknown): value is TasteHint | undefined {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  const taste = value as Record<string, unknown>;
  return (
    isAlbumList(taste.avoid, MAX_TASTE_AVOID) &&
    isAlbumList(taste.liked, MAX_TASTE_SAMPLE) &&
    isAlbumList(taste.disliked, MAX_TASTE_SAMPLE)
  );
}

function isSliderValue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= SLIDER_MIN &&
    value <= SLIDER_MAX
  );
}

function isValidPivot(value: unknown): value is PivotHint | undefined {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    (p.type === 'more-like-this' || p.type === 'something-different') &&
    isName(p.artist) &&
    isName(p.album)
  );
}

function isVisitEntry(value: unknown): value is VisitEntry {
  return VISIT_ENTRIES.some((entry) => entry === value);
}

function isVisitCount(value: unknown, min: number): value is number | undefined {
  if (value === undefined) return true;
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= MAX_VISIT_COUNT
  );
}

function isValidPreferences(value: unknown): value is RecommendationPreferences {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    // Length guard before .every() so an oversized array is rejected in O(1), not O(n).
    Array.isArray(p.genres) &&
    p.genres.length <= MAX_PREFERENCE_ARRAY_LENGTH &&
    isStringArray(p.genres) &&
    Array.isArray(p.moods) &&
    p.moods.length <= MAX_PREFERENCE_ARRAY_LENGTH &&
    isStringArray(p.moods) &&
    isSliderValue(p.tempo) &&
    isSliderValue(p.energy) &&
    isSliderValue(p.density) &&
    typeof p.era === 'string' &&
    VALID_ERAS.has(p.era) &&
    typeof p.includeFamiliarArtists === 'boolean' &&
    typeof p.prioritiseObscure === 'boolean' &&
    typeof p.stayFocused === 'boolean'
  );
}

function failureMessage(error: unknown): string {
  if (error instanceof NoFreshPickError) {
    return "We kept landing on albums you've already marked. Please try again.";
  }
  if (error instanceof UnverifiedRecommendationError) {
    return "Couldn't find a pick we could verify. Please try again.";
  }
  return 'Failed to get recommendation. Please try again.';
}

function limitMessage(error: DailyLimitError): string {
  if (error.scope === 'global') {
    return 'Plinth has reached its limit of picks for today, so new ones are paused until midnight UTC. Your crate is still here.';
  }
  return `You've used all ${error.limit} of today's picks. They come back at midnight UTC, and your crate is still here until then.`;
}

/** Who a pick is counted against: this device, or for a request without a token, its address. */
function visitorOf(req: Request, res: Response): Visitor {
  const device = deviceOf(res);
  return device ? { kind: 'device', id: device.id } : { kind: 'address', address: req.ip ?? '' };
}

export function createRecommendHandler(
  albums: AlbumRepository,
  dailyLimit: DailyPickLimiter,
  picks: IdempotencyCache<RecommendationResponse> = createIdempotencyCache(),
): (req: Request, res: Response) => Promise<void> {
  return (req, res) => handleRecommend(req, res, albums, dailyLimit, picks);
}

async function handleRecommend(
  req: Request,
  res: Response,
  albums: AlbumRepository,
  dailyLimit: DailyPickLimiter,
  picks: IdempotencyCache<RecommendationResponse>,
): Promise<void> {
  const body = req.body as Partial<RecommendationRequest>;

  if (!isValidPreferences(body.preferences)) {
    res.status(400).json({ error: 'preferences must be a valid RecommendationPreferences object' });
    return;
  }

  if (!isValidAlreadySuggested(body.alreadySuggested)) {
    res.status(400).json({
      error: `alreadySuggested must be an array of at most ${MAX_ALREADY_SUGGESTED} strings of ${MAX_SUGGESTION_LENGTH} characters or fewer`,
    });
    return;
  }

  if (!isValidPivot(body.pivot)) {
    res.status(400).json({ error: 'pivot must be a valid PivotHint object' });
    return;
  }

  const { seedArtist } = body;
  if (seedArtist !== undefined && !isName(seedArtist)) {
    res.status(400).json({
      error: `seedArtist must be a non-empty string of ${MAX_NAME_LENGTH} characters or fewer`,
    });
    return;
  }

  const { pickNumber, ratedThisVisit } = body;
  if (!isVisitCount(pickNumber, 1) || !isVisitCount(ratedThisVisit, 0)) {
    res.status(400).json({
      error: `pickNumber (from 1) and ratedThisVisit (from 0) must be whole numbers of at most ${MAX_VISIT_COUNT}`,
    });
    return;
  }

  const { taste } = body;
  if (!isValidTaste(taste)) {
    res.status(400).json({
      error: `taste must have avoid (at most ${MAX_TASTE_AVOID}), liked and disliked (at most ${MAX_TASTE_SAMPLE} each) lists of "Artist – Album" strings of ${MAX_SUGGESTION_LENGTH} characters or fewer`,
    });
    return;
  }

  const { vibeQuery } = body;
  if (
    vibeQuery !== undefined &&
    (typeof vibeQuery !== 'string' || vibeQuery.trim() === '' || vibeQuery.length > 300)
  ) {
    res.status(400).json({ error: 'vibeQuery must be a non-empty string (max 300 characters)' });
    return;
  }

  const { entry } = body;
  if (entry !== undefined && !isVisitEntry(entry)) {
    res.status(400).json({ error: `entry must be one of: ${VISIT_ENTRIES.join(', ')}` });
    return;
  }
  // Read here, where the checks above have narrowed them, rather than inside the closure below.
  const preferences = body.preferences;
  const alreadySuggested = body.alreadySuggested;
  const idempotencyKey = req.get(IDEMPOTENCY_KEY_HEADER);
  if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY_FORMAT.test(idempotencyKey)) {
    res.status(400).json({ error: `${IDEMPOTENCY_KEY_HEADER} must be a UUID` });
    return;
  }

  // Everything that counts or costs something is in here, so a retry that is answered from an
  // earlier request is neither counted as another pick nor paid for twice.
  const askForPick = async (): Promise<RecommendationResponse> => {
    // Before anything is logged or paid for, so a request that is turned away is not a pick.
    await dailyLimit.consume(visitorOf(req, res));
    // Counted when asked for, not when it succeeds: the question is whether people who arrive on
    // a shared link go on to try a pick, and a failed one still counts as trying.
    if (entry) logger.info({ entry }, 'pick requested after arriving');
    // One line for every pick asked for, so the log can say what share of picks were repeats, and
    // how many picks into a visit the listener had answered something. Counts only, never who.
    logger.info(
      { pickNumber: pickNumber ?? null, ratedThisVisit: ratedThisVisit ?? null },
      'pick requested',
    );
    // Counts only: how many albums a listener has rated shows whether the crate is being used.
    if (taste) {
      logger.info(
        { avoid: taste.avoid.length, liked: taste.liked.length, disliked: taste.disliked.length },
        'pick requested with taste',
      );
    }

    return getRecommendation(
      {
        preferences,
        alreadySuggested,
        pivot: body.pivot,
        seedArtist,
        vibeQuery,
        taste,
      },
      albums,
    );
  };

  try {
    // Scoped to the device, so one device's key can never answer for another's.
    const outcome = idempotencyKey
      ? await picks.run(`${deviceOf(res)?.id ?? 'anonymous'}:${idempotencyKey}`, askForPick)
      : { value: await askForPick(), replayed: false };
    if (outcome.replayed) {
      // The saving made visible: each of these is a Claude call that wasn't paid for twice.
      logger.info('pick replayed for a retry');
      res.set('Idempotent-Replayed', 'true');
    }
    res.json(outcome.value);
  } catch (error) {
    if (error instanceof DailyLimitError) {
      // Counts only: how often each limit is hit shows whether the numbers are about right.
      logger.info({ scope: error.scope }, 'daily limit reached');
      res.set('Retry-After', String(secondsUntilNextDay(new Date())));
      res.status(429).json({ error: limitMessage(error) });
      return;
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    logger.error({ error: message }, 'recommendation request failed');
    res.status(502).json({
      error: failureMessage(error),
    });
  }
}
