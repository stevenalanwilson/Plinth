import { Request, Response } from 'express';
import {
  getRecommendation,
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
  VISIT_ENTRIES,
  VisitEntry,
} from '@shared/types';
import { logger } from '../logger';
import { AlbumRepository } from '../repositories/albumRepository';

const VALID_ERAS = new Set<string>(ERA_VALUES);
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

function isValidAlreadySuggested(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_ALREADY_SUGGESTED &&
    value.every((item) => typeof item === 'string' && item.length <= MAX_SUGGESTION_LENGTH)
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

export function createRecommendHandler(
  albums: AlbumRepository,
): (req: Request, res: Response) => Promise<void> {
  return (req, res) => handleRecommend(req, res, albums);
}

async function handleRecommend(
  req: Request,
  res: Response,
  albums: AlbumRepository,
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
  // Counted when asked for, not when it succeeds: the question is whether people who arrive on
  // a shared link go on to try a pick, and a failed one still counts as trying.
  if (entry) logger.info({ entry }, 'pick requested after arriving');

  try {
    const recommendation = await getRecommendation(
      {
        preferences: body.preferences,
        alreadySuggested: body.alreadySuggested,
        pivot: body.pivot,
        seedArtist,
        vibeQuery,
      },
      albums,
    );
    res.json(recommendation);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    logger.error({ error: message }, 'recommendation request failed');
    res.status(502).json({
      error:
        error instanceof UnverifiedRecommendationError
          ? "Couldn't find a pick we could verify. Please try again."
          : 'Failed to get recommendation. Please try again.',
    });
  }
}
