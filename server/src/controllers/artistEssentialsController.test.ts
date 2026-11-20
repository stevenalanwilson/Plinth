import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../services/artistEssentialsService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/artistEssentialsService')>()),
  getArtistEssentials: vi.fn(),
}));

import { createArtistEssentialsHandler } from './artistEssentialsController';
import { DailyLimitError, Visitor } from '../services/dailyLimitService';
import {
  getArtistEssentials,
  UnverifiedEssentialsError,
} from '../services/artistEssentialsService';

const mockGetArtistEssentials = vi.mocked(getArtistEssentials);
const consume = vi.fn<[Visitor], Promise<void>>();
const handleArtistEssentials = createArtistEssentialsHandler({ consume });

function makeRes(locals: Record<string, unknown> = {}): {
  res: Response;
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const set = vi.fn();
  const res = { json, status, set, locals } as unknown as Response;
  return { res, json, status, set };
}

function makeReq(body: unknown, ip: string | undefined = '203.0.113.7'): Request {
  return { body, ip } as Request;
}

const mockResult = {
  artist: 'Talk Talk',
  albums: [{ album: 'Spirit of Eden', year: '1988', reason: 'A transformative work.' }],
  related: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  consume.mockResolvedValue(undefined);
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

  describe('an artist chosen from the suggestions', () => {
    const artistId = '9a58fda3-f4ed-4080-a3a5-f457aac9fcdd';

    it('passes the ID and what tells the artist apart to the service', async () => {
      mockGetArtistEssentials.mockResolvedValue(mockResult);
      const { res } = makeRes();

      await handleArtistEssentials(
        makeReq({ artist: 'Nirvana', artistId, detail: '  60s band\n from the UK ' }),
        res,
      );

      expect(mockGetArtistEssentials).toHaveBeenCalledWith({
        artist: 'Nirvana',
        artistId,
        detail: '60s band from the UK',
      });
    });

    it.each([
      ['an ID that is not a MusicBrainz ID', { artistId: 'not-an-id' }],
      ['an ID that is not text', { artistId: 123 }],
      ['a detail that is not text', { detail: 42 }],
      ['a detail that is too long', { detail: 'x'.repeat(151) }],
    ])('returns 400 for %s', async (_name, extra) => {
      const { res, status } = makeRes();

      await handleArtistEssentials(makeReq({ artist: 'Nirvana', ...extra }), res);

      expect(status).toHaveBeenCalledWith(400);
      expect(mockGetArtistEssentials).not.toHaveBeenCalled();
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

    it('says so when no albums could be verified', async () => {
      mockGetArtistEssentials.mockRejectedValue(new UnverifiedEssentialsError());
      const { res, status, json } = makeRes();

      await handleArtistEssentials(makeReq({ artist: 'Talk Talk' }), res);

      expect(status).toHaveBeenCalledWith(502);
      expect(json).toHaveBeenCalledWith({
        error:
          "Couldn't find albums we could verify for that artist. Check the name and try again.",
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

  describe('daily limits', () => {
    it('counts it against the account a signed-in device belongs to', async () => {
      mockGetArtistEssentials.mockResolvedValue(mockResult);
      const { res } = makeRes({ device: { id: 'device-a', accountId: 'account-1' } });

      await handleArtistEssentials(makeReq({ artist: 'Talk Talk' }), res);

      expect(consume).toHaveBeenCalledWith({ kind: 'account', id: 'account-1' });
    });

    it('counts it against the device when nobody is signed in', async () => {
      mockGetArtistEssentials.mockResolvedValue(mockResult);
      const { res } = makeRes({ device: { id: 'device-a' } });

      await handleArtistEssentials(makeReq({ artist: 'Talk Talk' }), res);

      expect(consume).toHaveBeenCalledWith({ kind: 'device', id: 'device-a' });
    });

    it('turns it away, with how long to wait, once the picks are used up', async () => {
      consume.mockRejectedValue(new DailyLimitError('visitor', 25));
      const { res, status, json, set } = makeRes();

      await handleArtistEssentials(makeReq({ artist: 'Talk Talk' }), res);

      expect(status).toHaveBeenCalledWith(429);
      expect(json).toHaveBeenCalledWith({
        error: expect.stringContaining('all 25 picks for today'),
        code: 'daily-limit',
      });
      expect(set).toHaveBeenCalledWith('Retry-After', expect.stringMatching(/^\d+$/));
      expect(mockGetArtistEssentials).not.toHaveBeenCalled();
    });

    it('does not count a request that was not valid', async () => {
      const { res } = makeRes();

      await handleArtistEssentials(makeReq({ artist: '' }), res);

      expect(consume).not.toHaveBeenCalled();
    });
  });
});
