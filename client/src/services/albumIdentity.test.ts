import { describe, it, expect } from 'vitest';
import { albumKeys, isSameAlbum } from './albumIdentity';

const JEOPARDY = { artist: 'The Sound', album: 'Jeopardy' };

describe('albumKeys', () => {
  it('names the album, ignoring case', () => {
    expect(albumKeys({ artist: 'The SOUND', album: 'jeopardy' })).toEqual(
      albumKeys(JEOPARDY).map((key) => key.toLowerCase()),
    );
  });

  it('adds the release group when there is one', () => {
    expect(albumKeys({ ...JEOPARDY, releaseGroupId: 'rg-1' })).toContain('release-group:rg-1');
    expect(albumKeys(JEOPARDY).some((key) => key.startsWith('release-group:'))).toBe(false);
  });
});

describe('isSameAlbum', () => {
  it('matches the same artist and title in any case', () => {
    expect(isSameAlbum(JEOPARDY, { artist: 'the sound', album: 'JEOPARDY' })).toBe(true);
  });

  it('matches the same release group under different spellings', () => {
    expect(
      isSameAlbum(
        { artist: 'Gil Scott‐Heron', album: 'Pieces of a Man', releaseGroupId: 'rg-1' },
        { artist: 'Gil Scott-Heron', album: 'Pieces of a Man', releaseGroupId: 'rg-1' },
      ),
    ).toBe(true);
  });

  it('matches a pick with no release group to the same album with one', () => {
    expect(isSameAlbum(JEOPARDY, { ...JEOPARDY, releaseGroupId: 'rg-1' })).toBe(true);
  });

  it('does not match different albums, even by the same artist', () => {
    expect(isSameAlbum(JEOPARDY, { artist: 'The Sound', album: 'From the Lion’s Mouth' })).toBe(
      false,
    );
  });

  it('still matches two release groups with the same name, as the library always has', () => {
    expect(
      isSameAlbum(
        { artist: 'Weezer', album: 'Weezer', releaseGroupId: 'rg-blue' },
        { artist: 'Weezer', album: 'Weezer', releaseGroupId: 'rg-green' },
      ),
    ).toBe(true);
  });
});
