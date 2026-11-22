import { describe, it, expect, beforeEach } from 'vitest';
import { AlbumRepository, NewAlbum } from './albumRepository';

const JEOPARDY: NewAlbum = {
  releaseGroupId: '3b4e2fb8-7a6f-3c1b-9a33-1f0c7d3f6a01',
  slug: 'the-sound-jeopardy',
  artist: 'The Sound',
  album: 'Jeopardy',
  year: '1980',
  hook: 'Post-punk with its heart on its sleeve.',
  genres: ['Post-punk'],
  country: 'United Kingdom',
};

const TAGO_MAGO: NewAlbum = {
  releaseGroupId: '9c3e1f0a-2b4d-4e5f-8a6b-7c8d9e0f1a2b',
  slug: 'can-tago-mago',
  artist: 'Can',
  album: 'Tago Mago',
  year: null,
  hook: null,
  genres: [],
  country: null,
};

/** Behaviour every AlbumRepository must share, so the in-memory one is a faithful stand-in. */
export function describeAlbumRepository(
  name: string,
  createRepository: () => Promise<AlbumRepository>,
): void {
  describe(`${name} (AlbumRepository contract)`, () => {
    let albums: AlbumRepository;

    beforeEach(async () => {
      albums = await createRepository();
    });

    it('stores an album and finds it by slug and by release group', async () => {
      const stored = await albums.insert(JEOPARDY);

      expect(stored).toMatchObject(JEOPARDY);
      expect(stored.createdAt).toBeInstanceOf(Date);
      expect(await albums.findBySlug('the-sound-jeopardy')).toMatchObject(JEOPARDY);
      expect(await albums.findByReleaseGroupId(JEOPARDY.releaseGroupId)).toMatchObject(JEOPARDY);
    });

    it('keeps nulls and empty genres', async () => {
      expect(await albums.insert(TAGO_MAGO)).toMatchObject(TAGO_MAGO);
    });

    it('returns null for albums it does not have', async () => {
      expect(await albums.findBySlug('nope')).toBeNull();
      expect(await albums.findByReleaseGroupId(TAGO_MAGO.releaseGroupId)).toBeNull();
    });

    it('keeps the first save of a release group', async () => {
      await albums.insert(JEOPARDY);

      const second = await albums.insert({ ...JEOPARDY, slug: 'other-slug', hook: 'Later hook' });

      expect(second.slug).toBe('the-sound-jeopardy');
      expect(second.hook).toBe(JEOPARDY.hook);
      expect(await albums.findBySlug('other-slug')).toBeNull();
    });

    it('starts with no artwork and an unchecked lookup', async () => {
      const stored = await albums.insert(JEOPARDY);

      expect(stored).toMatchObject({
        artworkUrl: null,
        appleMusicUrl: null,
        artworkCheckedAt: null,
      });
    });

    it('records an artwork lookup and returns the updated album', async () => {
      await albums.insert(JEOPARDY);
      const checkedAt = new Date('2026-11-16T12:00:00Z');

      const updated = await albums.updateArtwork(JEOPARDY.releaseGroupId, {
        artworkUrl: 'https://coverartarchive.org/release/x/1-500.jpg',
        appleMusicUrl: 'https://music.apple.com/gb/album/jeopardy/1',
        checkedAt,
      });

      expect(updated).toMatchObject({
        artworkUrl: 'https://coverartarchive.org/release/x/1-500.jpg',
        appleMusicUrl: 'https://music.apple.com/gb/album/jeopardy/1',
      });
      expect(updated?.artworkCheckedAt?.toISOString()).toBe(checkedAt.toISOString());
      expect((await albums.findBySlug(JEOPARDY.slug))?.artworkUrl).toBe(
        'https://coverartarchive.org/release/x/1-500.jpg',
      );
    });

    it('records a lookup that found no artwork', async () => {
      await albums.insert(JEOPARDY);

      const updated = await albums.updateArtwork(JEOPARDY.releaseGroupId, {
        artworkUrl: null,
        appleMusicUrl: null,
        checkedAt: new Date(),
      });

      expect(updated?.artworkUrl).toBeNull();
      expect(updated?.artworkCheckedAt).toBeInstanceOf(Date);
    });

    it('returns null when updating artwork for an album it does not have', async () => {
      expect(
        await albums.updateArtwork(TAGO_MAGO.releaseGroupId, {
          artworkUrl: null,
          appleMusicUrl: null,
          checkedAt: new Date(),
        }),
      ).toBeNull();
    });

    it('rejects a slug that belongs to a different album', async () => {
      await albums.insert(JEOPARDY);

      await expect(albums.insert({ ...TAGO_MAGO, slug: JEOPARDY.slug })).rejects.toThrow();
    });
  });
}
