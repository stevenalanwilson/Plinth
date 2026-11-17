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

    describe('recent albums with a cover and a hook', () => {
      const COVER = {
        artworkUrl: 'https://coverartarchive.org/release/x/1-500.jpg',
        appleMusicUrl: null,
        checkedAt: new Date(),
      };
      const PORNOGRAPHY: NewAlbum = {
        ...JEOPARDY,
        releaseGroupId: '5d1c4e2a-8b3f-4a6c-9d7e-0f1a2b3c4d5e',
        slug: 'the-cure-pornography',
        artist: 'The Cure',
        album: 'Pornography',
        hook: 'The Cure at their most claustrophobic.',
      };
      const NO_COVER: NewAlbum = {
        ...JEOPARDY,
        releaseGroupId: '7e2d5f3b-9c4a-4b7d-8e6f-1a2b3c4d5e6f',
        slug: 'wire-pink-flag',
        artist: 'Wire',
        album: 'Pink Flag',
        hook: '21 songs in 35 minutes.',
      };

      it('returns only albums that have both, newest first', async () => {
        await albums.insert(JEOPARDY);
        await albums.updateArtwork(JEOPARDY.releaseGroupId, COVER);
        await albums.insert(TAGO_MAGO);
        await albums.updateArtwork(TAGO_MAGO.releaseGroupId, COVER);
        await albums.insert(NO_COVER);
        await albums.updateArtwork(NO_COVER.releaseGroupId, { ...COVER, artworkUrl: null });
        await albums.insert(PORNOGRAPHY);
        await albums.updateArtwork(PORNOGRAPHY.releaseGroupId, COVER);

        const recent = await albums.findRecentWithCoverAndHook(10);

        expect(recent.map((album) => album.slug)).toEqual([
          'the-cure-pornography',
          'the-sound-jeopardy',
        ]);
      });

      it('returns no more than the limit', async () => {
        await albums.insert(JEOPARDY);
        await albums.updateArtwork(JEOPARDY.releaseGroupId, COVER);
        await albums.insert(PORNOGRAPHY);
        await albums.updateArtwork(PORNOGRAPHY.releaseGroupId, COVER);

        const recent = await albums.findRecentWithCoverAndHook(1);

        expect(recent.map((album) => album.slug)).toEqual(['the-cure-pornography']);
      });

      it('returns nothing when no album qualifies', async () => {
        await albums.insert(TAGO_MAGO);

        expect(await albums.findRecentWithCoverAndHook(10)).toEqual([]);
      });
    });

    it('rejects a slug that belongs to a different album', async () => {
      await albums.insert(JEOPARDY);

      await expect(albums.insert({ ...TAGO_MAGO, slug: JEOPARDY.slug })).rejects.toThrow();
    });
  });
}
