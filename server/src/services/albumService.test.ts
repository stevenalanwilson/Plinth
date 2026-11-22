import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./artworkService', () => ({ fetchArtwork: vi.fn() }));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { AlbumRepository } from '../repositories/albumRepository';
import { createInMemoryAlbumRepository } from '../repositories/inMemoryAlbumRepository';
import { AlbumToSave, getAlbum, saveAlbum } from './albumService';
import { fetchArtwork } from './artworkService';
import { logger } from '../logger';

const mockFetchArtwork = vi.mocked(fetchArtwork);
const COVER = 'https://coverartarchive.org/release-group/x/front-500.jpg';
const APPLE = 'https://music.apple.com/gb/album/jeopardy/1';

const JEOPARDY: AlbumToSave = {
  releaseGroupId: 'a1b2c3d4-0000-4000-8000-000000000001',
  artist: 'The Sound',
  album: 'Jeopardy',
  year: '1980',
  hook: 'Post-punk with its heart on its sleeve.',
  genres: ['Post-punk'],
  country: 'United Kingdom',
};

let albums: AlbumRepository;

beforeEach(() => {
  vi.clearAllMocks();
  albums = createInMemoryAlbumRepository();
  mockFetchArtwork.mockResolvedValue({ artworkUrl: COVER, year: null, appleMusicUrl: APPLE });
});

describe('saveAlbum', () => {
  it('saves the album under a slug made from artist and title', async () => {
    const slug = await saveAlbum(albums, JEOPARDY);

    expect(slug).toBe('the-sound-jeopardy');
    expect(await albums.findBySlug(slug)).toMatchObject(JEOPARDY);
  });

  it('returns the existing slug when the album is already stored, keeping the first save', async () => {
    await saveAlbum(albums, JEOPARDY);

    const slug = await saveAlbum(albums, {
      ...JEOPARDY,
      album: 'Jeopardy (Remastered)',
      hook: 'Later',
    });

    expect(slug).toBe('the-sound-jeopardy');
    expect((await albums.findBySlug(slug))?.hook).toBe(JEOPARDY.hook);
  });

  it('adds part of the release group ID when another album already has the slug', async () => {
    await saveAlbum(albums, JEOPARDY);

    const slug = await saveAlbum(albums, {
      ...JEOPARDY,
      releaseGroupId: 'f9e8d7c6-0000-4000-8000-000000000002',
    });

    expect(slug).toBe('the-sound-jeopardy-f9e8d7');
  });

  it('falls back to a slug from the release group ID when the name has no letters', async () => {
    const slug = await saveAlbum(albums, { ...JEOPARDY, artist: '!!!', album: '...' });

    expect(slug).toBe('album-a1b2c3');
  });
});

describe('getAlbum', () => {
  const NOW = new Date('2026-11-16T12:00:00Z');
  const minutesLater = (minutes: number): Date => new Date(NOW.getTime() + minutes * 60_000);

  it('returns null for a slug it does not have', async () => {
    expect(await getAlbum(albums, 'nope', NOW)).toBeNull();
    expect(mockFetchArtwork).not.toHaveBeenCalled();
  });

  it('returns the stored album with artwork looked up by release group on first view', async () => {
    const slug = await saveAlbum(albums, JEOPARDY);

    const album = await getAlbum(albums, slug, NOW);

    expect(album).toEqual({
      slug: 'the-sound-jeopardy',
      releaseGroupId: JEOPARDY.releaseGroupId,
      artist: 'The Sound',
      album: 'Jeopardy',
      year: '1980',
      hook: JEOPARDY.hook,
      genres: ['Post-punk'],
      country: 'United Kingdom',
      artworkUrl: COVER,
      appleMusicUrl: APPLE,
    });
    expect(mockFetchArtwork).toHaveBeenCalledWith('The Sound', 'Jeopardy', JEOPARDY.releaseGroupId);
  });

  it('keeps the artwork, so later views make no lookups', async () => {
    const slug = await saveAlbum(albums, JEOPARDY);
    await getAlbum(albums, slug, NOW);

    const album = await getAlbum(albums, slug, minutesLater(60 * 24 * 30));

    expect(album?.artworkUrl).toBe(COVER);
    expect(mockFetchArtwork).toHaveBeenCalledTimes(1);
  });

  it('checks a missing cover again after an hour, but not sooner', async () => {
    mockFetchArtwork.mockResolvedValue({ artworkUrl: null, year: null, appleMusicUrl: null });
    const slug = await saveAlbum(albums, JEOPARDY);
    await getAlbum(albums, slug, NOW);

    await getAlbum(albums, slug, minutesLater(59));
    expect(mockFetchArtwork).toHaveBeenCalledTimes(1);

    mockFetchArtwork.mockResolvedValue({ artworkUrl: COVER, year: null, appleMusicUrl: null });
    const album = await getAlbum(albums, slug, minutesLater(61));
    expect(mockFetchArtwork).toHaveBeenCalledTimes(2);
    expect(album?.artworkUrl).toBe(COVER);
  });

  it('still returns the album when the artwork lookup fails, and tries again next time', async () => {
    mockFetchArtwork.mockRejectedValueOnce(new Error('budget exceeded'));
    const slug = await saveAlbum(albums, JEOPARDY);

    const album = await getAlbum(albums, slug, NOW);

    expect(album).toMatchObject({ slug, artworkUrl: null, appleMusicUrl: null });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'budget exceeded', slug }),
      'album artwork lookup failed',
    );

    await getAlbum(albums, slug, minutesLater(1));
    expect(mockFetchArtwork).toHaveBeenCalledTimes(2);
  });
});
