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
import { DailyLimitError, DailyPickLimiter, Visitor } from '../services/dailyLimitService';
import {
  getRecommendation,
  NoFreshPickError,
  UnverifiedRecommendationError,
} from '../services/recommendationService';

const mockGetRecommendation = vi.mocked(getRecommendation);
const albums = createInMemoryAlbumRepository();
const consume = vi.fn<[Visitor], Promise<void>>();
const dailyLimit: DailyPickLimiter = { consume };
const handleRecommend = createRecommendHandler(albums, dailyLimit);

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

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  const lowercased = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return { body, get: (name: string) => lowercased[name.toLowerCase()] } as unknown as Request;
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
  consume.mockResolvedValue(undefined);
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

describe('handleRecommend retries', () => {
  const body = { preferences: validPreferences, alreadySuggested: [] };
  const key = '3f2b8c1e-9d4a-4e6b-8a57-1c0d2e3f4a5b';
  const withKey = { 'Idempotency-Key': key };

  // A fresh handler for each test, so one test's remembered picks never answer another's.
  let handle: (req: Request, res: Response) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRecommendation.mockResolvedValue(mockRecommendation);
    handle = createRecommendHandler(albums, dailyLimit);
  });

  function pickRequestedLines(): unknown[] {
    return vi.mocked(logger.info).mock.calls.filter(([, message]) => message === 'pick requested');
  }

  it('answers a retry with the first pick, and does not ask Claude again', async () => {
    const first = makeRes();
    const retry = makeRes();

    await handle(makeReq(body, withKey), first.res);
    await handle(makeReq(body, withKey), retry.res);

    expect(mockGetRecommendation).toHaveBeenCalledTimes(1);
    expect(retry.json).toHaveBeenCalledWith(mockRecommendation);
  });

  it('marks an answer that was replayed, and not the first one', async () => {
    const first = makeRes();
    const retry = makeRes();

    await handle(makeReq(body, withKey), first.res);
    await handle(makeReq(body, withKey), retry.res);

    expect(first.set).not.toHaveBeenCalled();
    expect(retry.set).toHaveBeenCalledWith('Idempotent-Replayed', 'true');
  });

  it('counts a pick once, however many times it is sent', async () => {
    await handle(makeReq({ ...body, pickNumber: 2 }, withKey), makeRes().res);
    await handle(makeReq({ ...body, pickNumber: 2 }, withKey), makeRes().res);

    expect(pickRequestedLines()).toHaveLength(1);
    expect(logger.info).toHaveBeenCalledWith('pick replayed for a retry');
  });

  it('gives a retry that arrives while the first is still running the same pick', async () => {
    let finish: (value: typeof mockRecommendation) => void = () => {};
    mockGetRecommendation.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = makeRes();
    const retry = makeRes();

    const firstDone = handle(makeReq(body, withKey), first.res);
    const retryDone = handle(makeReq(body, withKey), retry.res);
    finish(mockRecommendation);
    await Promise.all([firstDone, retryDone]);

    expect(mockGetRecommendation).toHaveBeenCalledTimes(1);
    expect(first.json).toHaveBeenCalledWith(mockRecommendation);
    expect(retry.json).toHaveBeenCalledWith(mockRecommendation);
  });

  it('treats a different key as a new pick', async () => {
    await handle(makeReq(body, withKey), makeRes().res);
    await handle(
      makeReq(body, { 'Idempotency-Key': '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' }),
      makeRes().res,
    );

    expect(mockGetRecommendation).toHaveBeenCalledTimes(2);
  });

  it('asks every time when no key is sent, as older clients do', async () => {
    await handle(makeReq(body), makeRes().res);
    await handle(makeReq(body), makeRes().res);

    expect(mockGetRecommendation).toHaveBeenCalledTimes(2);
  });

  it('does not keep a failure, so the retry gets a real second try', async () => {
    mockGetRecommendation
      .mockRejectedValueOnce(new Error('Claude is down'))
      .mockResolvedValueOnce(mockRecommendation);
    const failed = makeRes();
    const retry = makeRes();

    await handle(makeReq(body, withKey), failed.res);
    await handle(makeReq(body, withKey), retry.res);

    expect(failed.status).toHaveBeenCalledWith(502);
    expect(retry.json).toHaveBeenCalledWith(mockRecommendation);
    expect(mockGetRecommendation).toHaveBeenCalledTimes(2);
  });

  it("never answers one device with another device's pick", async () => {
    await handle(makeReq(body, withKey), makeRes({ device: { id: 'device-a' } }).res);
    await handle(makeReq(body, withKey), makeRes({ device: { id: 'device-b' } }).res);

    expect(mockGetRecommendation).toHaveBeenCalledTimes(2);
  });

  it('answers the same device from its own earlier pick', async () => {
    await handle(makeReq(body, withKey), makeRes({ device: { id: 'device-a' } }).res);
    await handle(makeReq(body, withKey), makeRes({ device: { id: 'device-a' } }).res);

    expect(mockGetRecommendation).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['is not a UUID', 'not-a-uuid'],
    ['is empty', ''],
    ['is a UUID with something added', `${key}-extra`],
    ['is two keys', `${key}, ${key}`],
  ])('rejects a key that %s', async (_problem, badKey) => {
    const { res, status } = makeRes();

    await handle(makeReq(body, { 'Idempotency-Key': badKey }), res);

    expect(status).toHaveBeenCalledWith(400);
    expect(mockGetRecommendation).not.toHaveBeenCalled();
  });

  it('accepts a key in capitals', async () => {
    const { res, status } = makeRes();

    await handle(makeReq(body, { 'Idempotency-Key': key.toUpperCase() }), res);

    expect(status).not.toHaveBeenCalled();
  });
});

describe('handleRecommend daily limits', () => {
  const body = { preferences: validPreferences, alreadySuggested: [] };

  // The retry tests above build their own handler; each of these gets a fresh one too, so a
  // remembered pick from another test can't answer for one here.
  let handle: (req: Request, res: Response) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    consume.mockResolvedValue(undefined);
    mockGetRecommendation.mockResolvedValue(mockRecommendation);
    handle = createRecommendHandler(albums, dailyLimit);
  });

  function requestFrom(ip: string | undefined, headers: Record<string, string> = {}): Request {
    return { ...makeReq(body, headers), ip } as Request;
  }

  it('counts the pick against the device that asked', async () => {
    await handle(requestFrom('203.0.113.7'), makeRes({ device: { id: 'device-a' } }).res);

    expect(consume).toHaveBeenCalledWith({ kind: 'device', id: 'device-a' });
  });

  it('counts the pick against the account a signed-in device belongs to, not the device', async () => {
    await handle(
      requestFrom('203.0.113.7'),
      makeRes({ device: { id: 'device-a', accountId: 'account-1' } }).res,
    );

    expect(consume).toHaveBeenCalledWith({ kind: 'account', id: 'account-1' });
  });

  it('counts a request with no device by its address', async () => {
    await handle(requestFrom('203.0.113.7'), makeRes().res);

    expect(consume).toHaveBeenCalledWith({ kind: 'address', address: '203.0.113.7' });
  });

  it('says so, with how long to wait, when the visitor has had their picks', async () => {
    consume.mockRejectedValue(new DailyLimitError('visitor', 25));
    const { res, status, json, set } = makeRes();

    await handle(requestFrom('203.0.113.7'), res);

    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith({
      error: expect.stringContaining('all 25 picks for today'),
      code: 'daily-limit',
    });
    expect(set).toHaveBeenCalledWith('Retry-After', expect.stringMatching(/^\d+$/));
    expect(mockGetRecommendation).not.toHaveBeenCalled();
  });

  it('says so differently when it is the whole day’s total that is used up', async () => {
    consume.mockRejectedValue(new DailyLimitError('global', 1000));
    const { res, status, json } = makeRes();

    await handle(requestFrom('203.0.113.7'), res);

    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith({
      error: expect.stringContaining('Plinth has given out all its picks for today'),
      code: 'daily-limit',
    });
  });

  it('does not say "all 1" when the limit is a single pick', async () => {
    consume.mockRejectedValue(new DailyLimitError('visitor', 1));
    const { res, json } = makeRes();

    await handle(requestFrom('203.0.113.7'), res);

    const { error } = json.mock.calls[0][0] as { error: string };
    expect(error).toContain("today's pick");
    expect(error).not.toContain('all 1');
  });

  it('says picks are paused, not used up, when the limit is zero', async () => {
    consume.mockRejectedValue(new DailyLimitError('visitor', 0));
    const { res, json } = makeRes();

    await handle(requestFrom('203.0.113.7'), res);

    expect(json).toHaveBeenCalledWith({
      error: expect.stringContaining('paused'),
      code: 'daily-limit',
    });
  });

  it('does not count a request that was turned away as a pick', async () => {
    consume.mockRejectedValue(new DailyLimitError('visitor', 25));

    await handle(requestFrom('203.0.113.7'), makeRes().res);

    const pickLines = vi
      .mocked(logger.info)
      .mock.calls.filter(([, message]) => message === 'pick requested');
    expect(pickLines).toHaveLength(0);
    expect(logger.info).toHaveBeenCalledWith({ scope: 'visitor' }, 'daily limit reached');
  });

  it('does not log a limit as an error', async () => {
    consume.mockRejectedValue(new DailyLimitError('visitor', 25));

    await handle(requestFrom('203.0.113.7'), makeRes().res);

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not count a request that is not valid', async () => {
    await handle({ ...makeReq({}), ip: '203.0.113.7' } as Request, makeRes().res);

    expect(consume).not.toHaveBeenCalled();
  });

  it('counts a pick once, however many times it is retried', async () => {
    const key = '3f2b8c1e-9d4a-4e6b-8a57-1c0d2e3f4a5b';
    await handle(requestFrom('203.0.113.7', { 'Idempotency-Key': key }), makeRes().res);
    await handle(requestFrom('203.0.113.7', { 'Idempotency-Key': key }), makeRes().res);

    expect(consume).toHaveBeenCalledTimes(1);
  });

  it('counts a retry again when the first attempt was turned away', async () => {
    const key = '3f2b8c1e-9d4a-4e6b-8a57-1c0d2e3f4a5b';
    consume.mockRejectedValueOnce(new DailyLimitError('visitor', 25));
    const first = makeRes();
    const retry = makeRes();

    await handle(requestFrom('203.0.113.7', { 'Idempotency-Key': key }), first.res);
    await handle(requestFrom('203.0.113.7', { 'Idempotency-Key': key }), retry.res);

    expect(first.status).toHaveBeenCalledWith(429);
    expect(retry.json).toHaveBeenCalledWith(mockRecommendation);
  });

  it('still answers 502 for a failure that is not a limit', async () => {
    mockGetRecommendation.mockRejectedValue(new Error('Claude is down'));
    const { res, status } = makeRes();

    await handle(requestFrom('203.0.113.7'), res);

    expect(status).toHaveBeenCalledWith(502);
  });
});
