import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../services/artistEssentialsService', () => ({
  getArtistEssentials: vi.fn(),
}));

import { handleArtistEssentials } from './artistEssentialsController';
import { getArtistEssentials } from '../services/artistEssentialsService';

const mockGetArtistEssentials = vi.mocked(getArtistEssentials);

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

const mockResult = {
  artist: 'Talk Talk',
  albums: [{ album: 'Spirit of Eden', year: '1988', reason: 'A transformative work.' }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleArtistEssentials', () => {
  describe('valid requests', () => {
    it('returns 200 with result on success', async () => {
      mockGetArtistEssentials.mockResolvedValue(mockResult);
      const { res, json } = makeRes();

      await handleArtistEssentials(makeReq({ artist: 'Talk Talk' }), res);

      expect(mockGetArtistEssentials).toHaveBeenCalledWith({ artist: 'Talk Talk' });
      expect(json).toHaveBeenCalledWith(mockResult);
    });

    it('trims whitespace from artist name before calling service', async () => {
      mockGetArtistEssentials.mockResolvedValue(mockResult);
      const { res } = makeRes();

      await handleArtistEssentials(makeReq({ artist: '  Talk Talk  ' }), res);

      expect(mockGetArtistEssentials).toHaveBeenCalledWith({ artist: 'Talk Talk' });
    });
  });

  describe('invalid requests', () => {
    it('returns 400 when artist is missing', async () => {
      const { res, status, json } = makeRes();

      await handleArtistEssentials(makeReq({}), res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    });

    it('returns 400 when artist is an empty string', async () => {
      const { res, status } = makeRes();

      await handleArtistEssentials(makeReq({ artist: '' }), res);

      expect(status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when artist is whitespace only', async () => {
      const { res, status } = makeRes();

      await handleArtistEssentials(makeReq({ artist: '   ' }), res);

      expect(status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when artist is not a string', async () => {
      const { res, status } = makeRes();

      await handleArtistEssentials(makeReq({ artist: 123 }), res);

      expect(status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when artist exceeds 100 characters', async () => {
      const { res, status } = makeRes();

      await handleArtistEssentials(makeReq({ artist: 'a'.repeat(101) }), res);

      expect(status).toHaveBeenCalledWith(400);
    });
  });

  describe('service errors', () => {
    it('returns 502 when getArtistEssentials throws', async () => {
      mockGetArtistEssentials.mockRejectedValue(new Error('Claude API failed'));
      const { res, status, json } = makeRes();

      await handleArtistEssentials(makeReq({ artist: 'Talk Talk' }), res);

      expect(status).toHaveBeenCalledWith(502);
      expect(json).toHaveBeenCalledWith({
        error: 'Failed to get artist essentials. Please try again.',
      });
    });

    it('returns 502 when the error is not an Error instance', async () => {
      mockGetArtistEssentials.mockRejectedValue('string error');
      const { res, status, json } = makeRes();

      await handleArtistEssentials(makeReq({ artist: 'Talk Talk' }), res);

      expect(status).toHaveBeenCalledWith(502);
      expect(json).toHaveBeenCalledWith({
        error: 'Failed to get artist essentials. Please try again.',
      });
    });
  });
});
