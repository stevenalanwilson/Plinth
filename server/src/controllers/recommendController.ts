import { Request, Response } from 'express';
import { getRecommendation } from '../services/recommendationService';
import {
  RecommendationRequest,
  RecommendationPreferences,
  PivotHint,
  SLIDER_MIN,
  SLIDER_MAX,
  ERA_VALUES,
  MAX_PREFERENCE_ARRAY_LENGTH,
} from '@shared/types';
import { logger } from '../logger';

const VALID_ERAS = new Set<string>(ERA_VALUES);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
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
    typeof p.artist === 'string' &&
    typeof p.album === 'string'
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

export async function handleRecommend(req: Request, res: Response): Promise<void> {
  const body = req.body as Partial<RecommendationRequest>;

  if (!isValidPreferences(body.preferences)) {
    res.status(400).json({ error: 'preferences must be a valid RecommendationPreferences object' });
    return;
  }

  if (!isStringArray(body.alreadySuggested) || body.alreadySuggested.length > 150) {
    res.status(400).json({ error: 'alreadySuggested must be an array of strings (max 150)' });
    return;
  }

  if (!isValidPivot(body.pivot)) {
    res.status(400).json({ error: 'pivot must be a valid PivotHint object' });
    return;
  }

  const { seedArtist } = body;
  if (seedArtist !== undefined && (typeof seedArtist !== 'string' || seedArtist.trim() === '')) {
    res.status(400).json({ error: 'seedArtist must be a non-empty string' });
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

  try {
    const recommendation = await getRecommendation({
      preferences: body.preferences,
      alreadySuggested: body.alreadySuggested,
      pivot: body.pivot,
      seedArtist,
      vibeQuery,
    });
    res.json(recommendation);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    logger.error({ error: message }, 'recommendation request failed');
    res.status(502).json({ error: 'Failed to get recommendation. Please try again.' });
  }
}
