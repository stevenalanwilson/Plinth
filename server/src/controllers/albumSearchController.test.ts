import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../services/albumSearchService', () => ({ searchAlbums: vi.fn() }));

import { handleAlbumSearch } from './albumSearchController';
import { searchAlbums } from '../services/albumSearchService';

const mockSearch = vi.mocked(searchAlbums);

const KIND_OF_BLUE = {
  releaseGroupId: 'rg-1',
  artist: 'Miles Davis',
  album: 'Kind of Blue',
  year: '1959',
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
  return { res: { json, status, set } as unknown as Response, json, status, set };
}

function requestFor(q: unknown): Request {
  return { query: { q } } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleAlbumSearch', () => {
  it('answers with the albums found for what was typed', async () => {
    mockSearch.mockResolvedValue({ status: 'found', results: [KIND_OF_BLUE] });
    const { res, json } = makeRes();

    await handleAlbumSearch(requestFor('miles kind'), res);

    expect(mockSearch).toHaveBeenCalledWith('miles kind');
    expect(json).toHaveBeenCalledWith({ results: [KIND_OF_BLUE] });
  });

  it('tidies the spacing around what was typed before searching', async () => {
    mockSearch.mockResolvedValue({ status: 'found', results: [] });
    const { res } = makeRes();

    await handleAlbumSearch(requestFor('  miles  '), res);

    expect(mockSearch).toHaveBeenCalledWith('miles');
  });

  it('lets an answer be kept for a few minutes', async () => {
    mockSearch.mockResolvedValue({ status: 'found', results: [KIND_OF_BLUE] });
    const { res, set } = makeRes();

    await handleAlbumSearch(requestFor('miles'), res);

    expect(set).toHaveBeenCalledWith('Cache-Control', 'public, max-age=300');
  });

  it('answers with no albums, not an error, when none match', async () => {
    mockSearch.mockResolvedValue({ status: 'found', results: [] });
    const { res, json, status } = makeRes();

    await handleAlbumSearch(requestFor('zzzzqqq'), res);

    expect(status).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({ results: [] });
  });

  it('answers 503, and does not let it be kept, when the search is unavailable', async () => {
    mockSearch.mockResolvedValue({ status: 'unavailable' });
    const { res, status, set, json } = makeRes();

    await handleAlbumSearch(requestFor('miles'), res);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({ error: expect.any(String) });
    expect(set).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it.each([[undefined], [''], ['a'], ['   '], ['x'.repeat(81)], [['miles', 'kind']], [{ a: 'b' }]])(
    'answers 400 for q = %j',
    async (q) => {
      const { res, status } = makeRes();

      await handleAlbumSearch(requestFor(q), res);

      expect(status).toHaveBeenCalledWith(400);
      expect(mockSearch).not.toHaveBeenCalled();
    },
  );
});
