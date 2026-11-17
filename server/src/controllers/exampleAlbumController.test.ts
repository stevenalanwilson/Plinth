import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { AlbumResponse } from '@shared/types';

vi.mock('../services/albumService', () => ({ getExampleAlbum: vi.fn() }));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createExampleAlbumHandler } from './exampleAlbumController';
import { getExampleAlbum } from '../services/albumService';
import { createInMemoryAlbumRepository } from '../repositories/inMemoryAlbumRepository';
import { logger } from '../logger';

const mockGetExampleAlbum = vi.mocked(getExampleAlbum);
const albums = createInMemoryAlbumRepository();
const handleExampleAlbum = createExampleAlbumHandler(albums);

const JEOPARDY: AlbumResponse = {
  slug: 'the-sound-jeopardy',
  releaseGroupId: 'a1b2c3d4-0000-4000-8000-000000000001',
  artist: 'The Sound',
  album: 'Jeopardy',
  year: '1980',
  hook: 'Post-punk with its heart on its sleeve.',
  genres: ['Post-punk'],
  country: 'United Kingdom',
  artworkUrl: 'https://coverartarchive.org/release/x/1-500.jpg',
  appleMusicUrl: null,
};

function makeRes(): {
  res: Response;
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const set = vi.fn();
  const res = { json, status, set } as unknown as Response;
  return { res, json, status, set };
}

const req = {} as Request;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('example album handler', () => {
  it('responds with an example album, cacheable for five minutes', async () => {
    mockGetExampleAlbum.mockResolvedValue(JEOPARDY);
    const { res, json, set } = makeRes();

    await handleExampleAlbum(req, res);

    expect(mockGetExampleAlbum).toHaveBeenCalledWith(albums);
    expect(set).toHaveBeenCalledWith('Cache-Control', 'public, max-age=300');
    expect(json).toHaveBeenCalledWith(JEOPARDY);
  });

  it('responds 404, uncached, when there is no album to show yet', async () => {
    mockGetExampleAlbum.mockResolvedValue(null);
    const { res, status, json, set } = makeRes();

    await handleExampleAlbum(req, res);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: 'No example album yet' });
    expect(set).not.toHaveBeenCalled();
  });

  it('responds 500 and logs when the lookup fails', async () => {
    mockGetExampleAlbum.mockRejectedValue(new Error('connection refused'));
    const { res, status, json } = makeRes();

    await handleExampleAlbum(req, res);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: 'Failed to load an example album.' });
    expect(logger.error).toHaveBeenCalledWith(
      { error: 'connection refused' },
      'example album lookup failed',
    );
  });
});
