import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { RecommendationPreferences } from '@shared/types';

vi.mock('../services/recommendationService', () => ({
  getRecommendation: vi.fn(),
}));

import { handleRecommend } from './recommendController';
import { getRecommendation } from '../services/recommendationService';

const mockGetRecommendation = vi.mocked(getRecommendation);

function makeRes(): {
  res: Response;
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { json, status } as unknown as Response;
  return { res, json, status };
}

function makeReq(body: unknown): Request {
  return { body } as Request;
}

const validPreferences: RecommendationPreferences = {
  genres: ['Jazz'],
  moods: ['Chill'],
  tempo: 5,
  energy: 5,
  density: 5,
  era: 'any',
  includeFamiliarArtists: true,
  prioritiseObscure: false,
  stayFocused: false,
};

const validBody = {
  preferences: validPreferences,
  alreadySuggested: [],
};

const mockRecommendation = {
  artist: 'Massive Attack',
  album: 'Mezzanine',
  year: '1998',
  reason: 'A great fit.',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleRecommend', () => {
  describe('valid requests', () => {
    it('calls getRecommendation and responds with the result', async () => {
      mockGetRecommendation.mockResolvedValue(mockRecommendation);
      const { res, json } = makeRes();

      await handleRecommend(makeReq(validBody), res);

      expect(mockGetRecommendation).toHaveBeenCalledWith({
        preferences: validPreferences,
        alreadySuggested: [],
      });
      expect(json).toHaveBeenCalledWith(mockRecommendation);
    });

    it('passes alreadySuggested array through to the service', async () => {
      mockGetRecommendation.mockResolvedValue(mockRecommendation);
      const { res } = makeRes();
      const body = { ...validBody, alreadySuggested: ['Dummy', 'OK Computer'] };

      await handleRecommend(makeReq(body), res);

      expect(mockGetRecommendation).toHaveBeenCalledWith(
        expect.objectContaining({ alreadySuggested: ['Dummy', 'OK Computer'] }),
      );
    });
  });

  describe('invalid preferences', () => {
    it('returns 400 when preferences is missing', async () => {
      const { res, status, json } = makeRes();

      await handleRecommend(makeReq({ alreadySuggested: [] }), res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    });

    it('returns 400 when preferences is not an object', async () => {
      const { res, status } = makeRes();

      await handleRecommend(makeReq({ preferences: 'invalid', alreadySuggested: [] }), res);

      expect(status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when genres is not an array', async () => {
      const { res, status } = makeRes();
      const body = { ...validBody, preferences: { ...validPreferences, genres: 'Jazz' } };

      await handleRecommend(makeReq(body), res);

      expect(status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when tempo is out of range (below 1)', async () => {
      const { res, status } = makeRes();
      const body = { ...validBody, preferences: { ...validPreferences, tempo: 0 } };

      await handleRecommend(makeReq(body), res);

      expect(status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when tempo is out of range (above 10)', async () => {
      const { res, status } = makeRes();
      const body = { ...validBody, preferences: { ...validPreferences, tempo: 11 } };

      await handleRecommend(makeReq(body), res);

      expect(status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when energy is out of range', async () => {
      const { res, status } = makeRes();
      const body = { ...validBody, preferences: { ...validPreferences, energy: -1 } };

      await handleRecommend(makeReq(body), res);

      expect(status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when density is out of range', async () => {
      const { res, status } = makeRes();
      const body = { ...validBody, preferences: { ...validPreferences, density: 100 } };

      await handleRecommend(makeReq(body), res);

      expect(status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when era is not a valid value', async () => {
      const { res, status } = makeRes();
      const body = { ...validBody, preferences: { ...validPreferences, era: '1990s' } };

      await handleRecommend(makeReq(body), res);

      expect(status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when a boolean field is not a boolean', async () => {
      const { res, status } = makeRes();
      const body = {
        ...validBody,
        preferences: { ...validPreferences, includeFamiliarArtists: 'yes' },
      };

      await handleRecommend(makeReq(body), res);

      expect(status).toHaveBeenCalledWith(400);
    });
  });

  describe('invalid alreadySuggested', () => {
    it('returns 400 when alreadySuggested is missing', async () => {
      const { res, status } = makeRes();

      await handleRecommend(makeReq({ preferences: validPreferences }), res);

      expect(status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when alreadySuggested contains non-strings', async () => {
      const { res, status } = makeRes();
      const body = { preferences: validPreferences, alreadySuggested: [1, 2, 3] };

      await handleRecommend(makeReq(body), res);

      expect(status).toHaveBeenCalledWith(400);
    });
  });

  describe('service errors', () => {
    it('returns 500 when getRecommendation throws', async () => {
      mockGetRecommendation.mockRejectedValue(new Error('Claude API failed'));
      const { res, status, json } = makeRes();

      await handleRecommend(makeReq(validBody), res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({
        error: 'Failed to get recommendation. Please try again.',
      });
    });

    it('returns a generic message when the error is not an Error instance', async () => {
      mockGetRecommendation.mockRejectedValue('string error');
      const { res, status, json } = makeRes();

      await handleRecommend(makeReq(validBody), res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({
        error: 'Failed to get recommendation. Please try again.',
      });
    });
  });
});
