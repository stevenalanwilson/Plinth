import { describe, it, expect, beforeEach } from 'vitest';
import { AlbumRepository } from '../repositories/albumRepository';
import { createInMemoryAlbumRepository } from '../repositories/inMemoryAlbumRepository';
import { AlbumToSave, saveAlbum } from './albumService';

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
  albums = createInMemoryAlbumRepository();
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
