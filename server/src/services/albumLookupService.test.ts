import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../repositories/musicBrainzClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../repositories/musicBrainzClient')>()),
  musicBrainzFetch: vi.fn(),
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { musicBrainzFetch } from '../repositories/musicBrainzClient';
import { lookUpAlbumById } from './albumLookupService';

const mockFetch = vi.mocked(musicBrainzFetch);
const ID = '8e8a594f-2175-38c7-a871-abb68ec363e7';

function found(body: Record<string, unknown>): Response {
  return { ok: true, status: 200, json: async (): Promise<unknown> => body } as Response;
}

const KIND_OF_BLUE = {
  id: ID,
  title: 'Kind of Blue',
  'primary-type': 'Album',
  'first-release-date': '1959-08-17',
  'artist-credit': [{ name: 'Miles Davis' }],
  genres: [
    { name: 'cool jazz', count: 3 },
    { name: 'jazz', count: 12 },
    { name: 'modal jazz', count: 7 },
    { name: 'bebop', count: 1 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('lookUpAlbumById', () => {
  it('asks MusicBrainz for the release group by its id, with credits and genres', async () => {
    mockFetch.mockResolvedValue(found(KIND_OF_BLUE));

    await lookUpAlbumById(ID);

    const path = mockFetch.mock.calls[0][0];
    expect(path).toBe(`release-group/${ID}?inc=artist-credits+genres&fmt=json`);
  });

  it('describes the album as MusicBrainz names it, not as anyone said it was', async () => {
    mockFetch.mockResolvedValue(found(KIND_OF_BLUE));

    expect(await lookUpAlbumById(ID)).toEqual({
      status: 'found',
      album: {
        releaseGroupId: ID,
        artist: 'Miles Davis',
        album: 'Kind of Blue',
        year: '1959',
        hook: null,
        genres: ['Jazz', 'Modal jazz', 'Cool jazz'],
        country: null,
      },
    });
  });

  it('gives no year when MusicBrainz has no release date', async () => {
    mockFetch.mockResolvedValue(found({ ...KIND_OF_BLUE, 'first-release-date': '' }));

    const lookup = await lookUpAlbumById(ID);

    expect(lookup.status === 'found' && lookup.album.year).toBeNull();
  });

  it('is not found when MusicBrainz has no such release group', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 } as Response);

    expect(await lookUpAlbumById(ID)).toEqual({ status: 'not_found' });
  });

  it.each([['Single'], ['EP'], ['Broadcast'], [undefined]])(
    'is not found when it is a %s, not an album',
    async (type) => {
      mockFetch.mockResolvedValue(found({ ...KIND_OF_BLUE, 'primary-type': type }));

      expect(await lookUpAlbumById(ID)).toEqual({ status: 'not_found' });
    },
  );

  it('is not found when it has no artist to name', async () => {
    mockFetch.mockResolvedValue(found({ ...KIND_OF_BLUE, 'artist-credit': [] }));

    expect(await lookUpAlbumById(ID)).toEqual({ status: 'not_found' });
  });

  it('fails, rather than says not found, when MusicBrainz is busy or down', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 } as Response);

    expect(await lookUpAlbumById(ID)).toEqual({ status: 'lookup_failed' });
  });

  it('fails when the request throws', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));

    expect(await lookUpAlbumById(ID)).toEqual({ status: 'lookup_failed' });
  });
});
