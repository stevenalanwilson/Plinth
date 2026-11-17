import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { AlbumDetailsResponse } from '@shared/types';

vi.mock('../services/albumDetailsService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/albumDetailsService')>()),
  getAlbumDetails: vi.fn(),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createAlbumDetailsHandler } from './albumDetailsController';
import { AlbumDetailsUnavailableError, getAlbumDetails } from '../services/albumDetailsService';
import { createInMemoryAlbumRepository } from '../repositories/inMemoryAlbumRepository';

const mockGetAlbumDetails = vi.mocked(getAlbumDetails);
const albums = createInMemoryAlbumRepository();
const handleDetails = createAlbumDetailsHandler(albums);

const DETAILS: AlbumDetailsResponse = {
  release: { date: '1980-11', country: 'GB', label: 'Korova', catalogueNumber: 'KODE 2' },
  formats: ['12" Vinyl'],
  discs: [],
  moreFromArtist: null,
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

describe('album details handler', () => {
  it('responds with the details', async () => {
    mockGetAlbumDetails.mockResolvedValue(DETAILS);
    const { res, json } = makeRes();

    await handleDetails(makeReq('the-sound-jeopardy'), res);

    expect(mockGetAlbumDetails).toHaveBeenCalledWith(albums, 'the-sound-jeopardy');
    expect(json).toHaveBeenCalledWith(DETAILS);
  });

  it('responds 404 when no album has the slug', async () => {
    mockGetAlbumDetails.mockResolvedValue(null);
    const { res, status, json } = makeRes();

    await handleDetails(makeReq('nope'), res);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: 'Album not found' });
  });

  it.each(['The Sound', '../etc/passwd', '-leading', 'double--hyphen', 'a'.repeat(121)])(
    'rejects the malformed slug %s without a lookup',
    async (slug) => {
      const { res, status } = makeRes();

      await handleDetails(makeReq(slug), res);

      expect(status).toHaveBeenCalledWith(400);
      expect(mockGetAlbumDetails).not.toHaveBeenCalled();
    },
  );

  it('responds 502 with a retry message when MusicBrainz cannot supply the details', async () => {
    mockGetAlbumDetails.mockRejectedValue(new AlbumDetailsUnavailableError());
    const { res, status, json } = makeRes();

    await handleDetails(makeReq('the-sound-jeopardy'), res);

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith({
      error: "Couldn't load the album details. Please try again.",
    });
  });

  it('responds 500 for any other failure', async () => {
    mockGetAlbumDetails.mockRejectedValue(new Error('connection refused'));
    const { res, status, json } = makeRes();

    await handleDetails(makeReq('the-sound-jeopardy'), res);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: 'Failed to load album details.' });
  });
});
