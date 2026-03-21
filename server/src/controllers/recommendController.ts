import { Request, Response } from 'express';
import { getRecommendation } from '../services/recommendationService';
import { RecommendationRequest, RecommendationPreferences } from '@shared/types';
import { logger } from '../logger';

const VALID_ERAS = new Set(['pre-80s', '80s-90s', '00s-10s', 'recent', 'any']);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isValidPreferences(value: unknown): value is RecommendationPreferences {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    isStringArray(p.genres) &&
    isStringArray(p.moods) &&
    typeof p.tempo === 'number' &&
    typeof p.energy === 'number' &&
    typeof p.density === 'number' &&
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

  if (!isStringArray(body.alreadySuggested)) {
    res.status(400).json({ error: 'alreadySuggested must be an array of strings' });
    return;
  }

  try {
    const recommendation = await getRecommendation({
      preferences: body.preferences,
      alreadySuggested: body.alreadySuggested,
    });
    res.json(recommendation);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    logger.error({ error: message }, 'recommendation request failed');
    res.status(500).json({ error: message });
  }
}
