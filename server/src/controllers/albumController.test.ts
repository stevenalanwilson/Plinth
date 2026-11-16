import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { AlbumResponse } from '@shared/types';

vi.mock('../services/albumService', () => ({ getAlbum: vi.fn() }));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createAlbumHandler } from './albumController';
import { getAlbum } from '../services/albumService';
import { createInMemoryAlbumRepository } from '../repositories/inMemoryAlbumRepository';

const mockGetAlbum = vi.mocked(getAlbum);
const albums = createInMemoryAlbumRepository();
const handleAlbum = createAlbumHandler(albums);

const JEOPARDY: AlbumResponse = {
  slug: 'the-sound-jeopardy',
  releaseGroupId: 'a1b2c3d4-0000-4000-8000-000000000001',
  artist: 'The Sound',
  album: 'Jeopardy',
  year: '1980',
  hook: 'Post-punk with its heart on its sleeve.',
  genres: ['Post-punk'],
  country: 'United Kingdom',
  artworkUrl: null,
  appleMusicUrl: null,
};

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

function makeReq(slug: string): Request {
  return { params: { slug } } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('album handler', () => {
  it('responds with the album', async () => {
    mockGetAlbum.mockResolvedValue(JEOPARDY);
    const { res, json } = makeRes();

    await handleAlbum(makeReq('the-sound-jeopardy'), res);

    expect(mockGetAlbum).toHaveBeenCalledWith(albums, 'the-sound-jeopardy');
    expect(json).toHaveBeenCalledWith(JEOPARDY);
  });

  it('accepts slugs in scripts without a Latin form', async () => {
    mockGetAlbum.mockResolvedValue(JEOPARDY);
    const { res, json } = makeRes();

    await handleAlbum(makeReq('大瀧詠一-a-long-vacation'), res);

    expect(json).toHaveBeenCalledWith(JEOPARDY);
  });

  it('responds 404 when no album has the slug', async () => {
    mockGetAlbum.mockResolvedValue(null);
    const { res, status, json } = makeRes();

    await handleAlbum(makeReq('nope'), res);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: 'Album not found' });
  });

  it.each([
    'The Sound',
    '../etc/passwd',
    '-leading',
    'trailing-',
    'double--hyphen',
    'a'.repeat(121),
  ])('rejects the malformed slug %s without a lookup', async (slug) => {
    const { res, status } = makeRes();

    await handleAlbum(makeReq(slug), res);

    expect(status).toHaveBeenCalledWith(400);
    expect(mockGetAlbum).not.toHaveBeenCalled();
  });

  it('responds 500 when the lookup fails', async () => {
    mockGetAlbum.mockRejectedValue(new Error('connection refused'));
    const { res, status, json } = makeRes();

    await handleAlbum(makeReq('the-sound-jeopardy'), res);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: 'Failed to load album.' });
  });
});
