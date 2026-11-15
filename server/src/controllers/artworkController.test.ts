import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../services/artworkService', () => ({ fetchArtwork: vi.fn() }));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { handleArtwork } from './artworkController';
import { fetchArtwork } from '../services/artworkService';

const mockFetchArtwork = vi.mocked(fetchArtwork);
const RELEASE_GROUP_ID = 'ae0f7b78-3dce-3157-8dd5-a82251dcf8ef';
const ARTWORK = { artworkUrl: null, year: null, appleMusicUrl: null };

function makeRes(): {
  res: Response;
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { json, status } as unknown as Response, json, status };
}

function makeReq(query: Record<string, unknown>): Request {
  return { query } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchArtwork.mockResolvedValue(ARTWORK);
});

describe('handleArtwork', () => {
  it('passes a release group ID through to the artwork lookup', async () => {
    const { res, json } = makeRes();

    await handleArtwork(
      makeReq({ artist: 'The Sound', album: 'Jeopardy', releaseGroupId: RELEASE_GROUP_ID }),
      res,
    );

    expect(mockFetchArtwork).toHaveBeenCalledWith('The Sound', 'Jeopardy', RELEASE_GROUP_ID);
    expect(json).toHaveBeenCalledWith(ARTWORK);
  });

  it('looks artwork up by name when there is no release group ID', async () => {
    const { res } = makeRes();

    await handleArtwork(makeReq({ artist: 'The Sound', album: 'Jeopardy' }), res);

    expect(mockFetchArtwork).toHaveBeenCalledWith('The Sound', 'Jeopardy', undefined);
  });

  it('rejects a release group ID that is not a MusicBrainz ID', async () => {
    const { res, status } = makeRes();

    await handleArtwork(
      makeReq({ artist: 'The Sound', album: 'Jeopardy', releaseGroupId: '../../evil' }),
      res,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(mockFetchArtwork).not.toHaveBeenCalled();
  });

  it('requires artist and album', async () => {
    const { res, status } = makeRes();

    await handleArtwork(makeReq({ artist: 'The Sound' }), res);

    expect(status).toHaveBeenCalledWith(400);
  });

  it('returns 502 when the lookup throws', async () => {
    mockFetchArtwork.mockRejectedValue(new Error('boom'));
    const { res, status } = makeRes();

    await handleArtwork(makeReq({ artist: 'The Sound', album: 'Jeopardy' }), res);

    expect(status).toHaveBeenCalledWith(502);
  });
});
