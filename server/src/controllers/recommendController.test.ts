import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { RecommendationPreferences } from '@shared/types';

vi.mock('../services/recommendationService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/recommendationService')>()),
  getRecommendation: vi.fn(),
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createRecommendHandler } from './recommendController';
import { logger } from '../logger';
import { createInMemoryAlbumRepository } from '../repositories/inMemoryAlbumRepository';
import {
  getRecommendation,
  NoFreshPickError,
  UnverifiedRecommendationError,
} from '../services/recommendationService';

const mockGetRecommendation = vi.mocked(getRecommendation);
const albums = createInMemoryAlbumRepository();
const handleRecommend = createRecommendHandler(albums);

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

      expect(mockGetRecommendation).toHaveBeenCalledWith(
        { preferences: validPreferences, alreadySuggested: [] },
        albums,
      );
      expect(json).toHaveBeenCalledWith(mockRecommendation);
    });

    it('passes alreadySuggested array through to the service', async () => {
      mockGetRecommendation.mockResolvedValue(mockRecommendation);
      const { res } = makeRes();
      const body = { ...validBody, alreadySuggested: ['Dummy', 'OK Computer'] };

      await handleRecommend(makeReq(body), res);

      expect(mockGetRecommendation).toHaveBeenCalledWith(
        expect.objectContaining({ alreadySuggested: ['Dummy', 'OK Computer'] }),
        albums,
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

  describe('oversized text fields', () => {
    const tooLongName = 'x'.repeat(501);
    const pivot = { type: 'more-like-this', artist: 'Massive Attack', album: 'Mezzanine' };

    it('returns 400 when seedArtist is too long', async () => {
      const { res, status } = makeRes();

      await handleRecommend(makeReq({ ...validBody, seedArtist: tooLongName }), res);

      expect(status).toHaveBeenCalledWith(400);
      expect(mockGetRecommendation).not.toHaveBeenCalled();
    });

    it('returns 400 when pivot artist is too long', async () => {
      const { res, status } = makeRes();

      await handleRecommend(
        makeReq({ ...validBody, pivot: { ...pivot, artist: tooLongName } }),
        res,
      );

      expect(status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when pivot album is too long', async () => {
      const { res, status } = makeRes();

      await handleRecommend(
        makeReq({ ...validBody, pivot: { ...pivot, album: tooLongName } }),
        res,
      );

      expect(status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when an alreadySuggested entry is too long', async () => {
      const { res, status } = makeRes();
      const body = { ...validBody, alreadySuggested: [`${tooLongName} – ${tooLongName}`] };

      await handleRecommend(makeReq(body), res);

      expect(status).toHaveBeenCalledWith(400);
    });

    it('accepts very long but real album titles', async () => {
      // Some real titles run to hundreds of characters; the cap must not reject them.
      mockGetRecommendation.mockResolvedValue(mockRecommendation);
      const { res, json } = makeRes();
      const longAlbum = 'y'.repeat(500);
      const body = {
        ...validBody,
        pivot: { ...pivot, album: longAlbum },
        alreadySuggested: [`${'x'.repeat(500)} – ${longAlbum}`],
      };

      await handleRecommend(makeReq(body), res);

      expect(json).toHaveBeenCalledWith(mockRecommendation);
    });
  });

  describe('service errors', () => {
    it('returns 500 when getRecommendation throws', async () => {
      mockGetRecommendation.mockRejectedValue(new Error('Claude API failed'));
      const { res, status, json } = makeRes();

      await handleRecommend(makeReq(validBody), res);

      expect(status).toHaveBeenCalledWith(502);
      expect(json).toHaveBeenCalledWith({
        error: 'Failed to get recommendation. Please try again.',
      });
    });

    it('says so when no pick could be verified', async () => {
      mockGetRecommendation.mockRejectedValue(new UnverifiedRecommendationError());
      const { res, status, json } = makeRes();

      await handleRecommend(makeReq(validBody), res);

      expect(status).toHaveBeenCalledWith(502);
      expect(json).toHaveBeenCalledWith({
        error: "Couldn't find a pick we could verify. Please try again.",
      });
    });

    it('says so when every pick was an album the listener already marked', async () => {
      mockGetRecommendation.mockRejectedValue(new NoFreshPickError());
      const { res, status, json } = makeRes();

      await handleRecommend(makeReq(validBody), res);

      expect(status).toHaveBeenCalledWith(502);
      expect(json).toHaveBeenCalledWith({
        error: "We kept landing on albums you've already marked. Please try again.",
      });
    });

    it('returns a generic message when the error is not an Error instance', async () => {
      mockGetRecommendation.mockRejectedValue('string error');
      const { res, status, json } = makeRes();

      await handleRecommend(makeReq(validBody), res);

      expect(status).toHaveBeenCalledWith(502);
      expect(json).toHaveBeenCalledWith({
        error: 'Failed to get recommendation. Please try again.',
      });
    });
  });
});

describe('recommend handler: where the visit began', () => {
  const body = { preferences: validPreferences, alreadySuggested: [] };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRecommendation.mockResolvedValue({
      artist: 'The Sound',
      album: 'Jeopardy',
      year: '1980',
      reason: 'Because.',
    });
  });

  it('counts a pick asked for after arriving on a shared link', async () => {
    const { res } = makeRes();

    await handleRecommend(makeReq({ ...body, entry: 'shared-link' }), res);

    expect(logger.info).toHaveBeenCalledWith(
      { entry: 'shared-link' },
      'pick requested after arriving',
    );
  });

  it('counts it even when the pick fails', async () => {
    mockGetRecommendation.mockRejectedValue(new Error('Claude is down'));
    const { res } = makeRes();

    await handleRecommend(makeReq({ ...body, entry: 'shared-link' }), res);

    expect(logger.info).toHaveBeenCalledWith(
      { entry: 'shared-link' },
      'pick requested after arriving',
    );
  });

  it('logs nothing about arrival for an ordinary pick', async () => {
    const { res } = makeRes();

    await handleRecommend(makeReq(body), res);

    expect(logger.info).not.toHaveBeenCalledWith(
      expect.anything(),
      'pick requested after arriving',
    );
  });

  it('does not pass the entry on to the recommendation', async () => {
    const { res } = makeRes();

    await handleRecommend(makeReq({ ...body, entry: 'shared-link' }), res);

    expect(mockGetRecommendation.mock.calls[0][0]).not.toHaveProperty('entry');
  });

  it.each(['newsletter', 1, null, ''])('rejects the unknown entry %j', async (entry) => {
    const { res, status } = makeRes();

    await handleRecommend(makeReq({ ...body, entry }), res);

    expect(status).toHaveBeenCalledWith(400);
    expect(mockGetRecommendation).not.toHaveBeenCalled();
  });
});

describe('recommend handler: taste', () => {
  const albumsList = (count: number): string[] =>
    Array.from({ length: count }, (_, i) => `Artist ${i} – Album ${i}`);
  const taste = {
    avoid: ['Wire – Pink Flag'],
    liked: ['The Sound – Jeopardy'],
    disliked: ['Can – Tago Mago'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRecommendation.mockResolvedValue(mockRecommendation);
  });

  it('passes the listener’s taste on to the recommendation', async () => {
    const { res } = makeRes();

    await handleRecommend(makeReq({ ...validBody, taste }), res);

    expect(mockGetRecommendation.mock.calls[0][0]).toMatchObject({ taste });
  });

  it('logs how many albums the listener has rated, and nothing else about them', async () => {
    const { res } = makeRes();

    await handleRecommend(makeReq({ ...validBody, taste }), res);

    expect(logger.info).toHaveBeenCalledWith(
      { avoid: 1, liked: 1, disliked: 1 },
      'pick requested with taste',
    );
  });

  it('logs nothing about taste for a pick without any', async () => {
    const { res } = makeRes();

    await handleRecommend(makeReq(validBody), res);

    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), 'pick requested with taste');
  });

  it('accepts the largest lists it allows', async () => {
    const { res, status } = makeRes();

    await handleRecommend(
      makeReq({
        ...validBody,
        taste: { avoid: albumsList(500), liked: albumsList(12), disliked: albumsList(12) },
      }),
      res,
    );

    expect(status).not.toHaveBeenCalled();
    expect(mockGetRecommendation).toHaveBeenCalled();
  });

  it.each([
    ['avoid has too many albums', { ...taste, avoid: albumsList(501) }],
    ['liked has too many albums', { ...taste, liked: albumsList(13) }],
    ['disliked has too many albums', { ...taste, disliked: albumsList(13) }],
    ['an album name is too long', { ...taste, liked: ['x'.repeat(1100)] }],
    ['an entry is not a string', { ...taste, avoid: ['Wire – Pink Flag', 42] }],
    ['avoid is missing', { liked: [], disliked: [] }],
    ['liked is not a list', { ...taste, liked: 'The Sound – Jeopardy' }],
    ['disliked is missing', { avoid: [], liked: [] }],
    ['taste is a string', 'The Sound – Jeopardy'],
    ['taste is null', null],
    ['taste is a list', []],
  ])('rejects a taste where %s', async (_problem, badTaste) => {
    const { res, status } = makeRes();

    await handleRecommend(makeReq({ ...validBody, taste: badTaste }), res);

    expect(status).toHaveBeenCalledWith(400);
    expect(mockGetRecommendation).not.toHaveBeenCalled();
  });
});

describe('recommend handler: how far into a visit', () => {
  const body = { preferences: validPreferences, alreadySuggested: [] };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRecommendation.mockResolvedValue(mockRecommendation);
  });

  it('logs which pick this is in the visit and how many albums have been answered', async () => {
    const { res } = makeRes();

    await handleRecommend(makeReq({ ...body, pickNumber: 3, ratedThisVisit: 2 }), res);

    expect(logger.info).toHaveBeenCalledWith(
      { pickNumber: 3, ratedThisVisit: 2 },
      'pick requested',
    );
  });

  it('logs every pick, with nulls when the client did not say', async () => {
    const { res } = makeRes();

    await handleRecommend(makeReq(body), res);

    expect(logger.info).toHaveBeenCalledWith(
      { pickNumber: null, ratedThisVisit: null },
      'pick requested',
    );
  });

  it('logs a pick once, even when it fails', async () => {
    mockGetRecommendation.mockRejectedValue(new Error('Claude is down'));
    const { res } = makeRes();

    await handleRecommend(makeReq({ ...body, pickNumber: 1, ratedThisVisit: 0 }), res);

    const lines = vi
      .mocked(logger.info)
      .mock.calls.filter(([, message]) => message === 'pick requested');
    expect(lines).toHaveLength(1);
  });

  it('keeps a visit that has answered nothing distinct from one that did not say', async () => {
    const { res } = makeRes();

    await handleRecommend(makeReq({ ...body, pickNumber: 1, ratedThisVisit: 0 }), res);

    expect(logger.info).toHaveBeenCalledWith(
      { pickNumber: 1, ratedThisVisit: 0 },
      'pick requested',
    );
  });

  it('does not pass the visit counts on to the recommendation', async () => {
    const { res } = makeRes();

    await handleRecommend(makeReq({ ...body, pickNumber: 3, ratedThisVisit: 2 }), res);

    expect(mockGetRecommendation.mock.calls[0][0]).not.toHaveProperty('pickNumber');
    expect(mockGetRecommendation.mock.calls[0][0]).not.toHaveProperty('ratedThisVisit');
  });

  it('accepts the largest counts it allows', async () => {
    const { res, status } = makeRes();

    await handleRecommend(makeReq({ ...body, pickNumber: 1000, ratedThisVisit: 1000 }), res);

    expect(status).not.toHaveBeenCalled();
  });

  it.each([
    ['pickNumber is 0', { pickNumber: 0 }],
    ['pickNumber is negative', { pickNumber: -1 }],
    ['pickNumber is not whole', { pickNumber: 1.5 }],
    ['pickNumber is a string', { pickNumber: '2' }],
    ['pickNumber is null', { pickNumber: null }],
    ['pickNumber is over the limit', { pickNumber: 1001 }],
    ['ratedThisVisit is negative', { ratedThisVisit: -1 }],
    ['ratedThisVisit is not whole', { ratedThisVisit: 1.5 }],
    ['ratedThisVisit is a string', { ratedThisVisit: '3' }],
    ['ratedThisVisit is null', { ratedThisVisit: null }],
    ['ratedThisVisit is over the limit', { ratedThisVisit: 1001 }],
  ])('rejects a request where %s', async (_problem, extra) => {
    const { res, status } = makeRes();

    await handleRecommend(makeReq({ ...body, ...extra }), res);

    expect(status).toHaveBeenCalledWith(400);
    expect(mockGetRecommendation).not.toHaveBeenCalled();
  });
});
