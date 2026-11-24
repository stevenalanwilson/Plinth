import { describe, it, expect } from 'vitest';
import {
  likeTheseState,
  openTopThreeState,
  vibeFromState,
  qualifierFromState,
  MAX_VIBE_LENGTH,
} from './listNavigation';

const THREE = [
  { artist: 'Nirvana', album: 'Nevermind' },
  { artist: 'The Beatles', album: 'Abbey Road' },
  { artist: 'Miles Davis', album: 'Kind of Blue' },
];

describe('like these', () => {
  it('turns the albums into a vibe that names each, in order', () => {
    expect(vibeFromState(likeTheseState(THREE))).toBe(
      'Albums in the spirit of Nevermind by Nirvana, Abbey Road by The Beatles and Kind of Blue by Miles Davis',
    );
  });

  it('names one album, or two, without stray commas', () => {
    expect(vibeFromState(likeTheseState(THREE.slice(0, 1)))).toBe(
      'Albums in the spirit of Nevermind by Nirvana',
    );
    expect(vibeFromState(likeTheseState(THREE.slice(0, 2)))).toBe(
      'Albums in the spirit of Nevermind by Nirvana and Abbey Road by The Beatles',
    );
  });

  it('keeps long titles short enough for the server, which allows 300 characters', () => {
    const long = 'A very long title '.repeat(12);
    const albums = THREE.map((album) => ({ ...album, album: long }));

    const vibe = vibeFromState(likeTheseState(albums));

    expect(vibe).not.toBeNull();
    expect((vibe as string).length).toBeLessThanOrEqual(MAX_VIBE_LENGTH);
    expect(vibe).toContain('Nirvana');
    expect(vibe).toContain('Miles Davis');
  });

  it('falls back to the artists alone when even short titles will not fit', () => {
    const albums = Array.from({ length: 10 }, (_unused, index) => ({
      artist: `An artist with a rather long name number ${index}`,
      album: `An album with a rather long name number ${index}`,
    }));

    const vibe = vibeFromState(likeTheseState(albums));

    expect(vibe).not.toBeNull();
    expect((vibe as string).length).toBeLessThanOrEqual(MAX_VIBE_LENGTH);
  });

  it.each([
    null,
    undefined,
    'likeThese',
    {},
    { likeThese: null },
    { likeThese: [] },
    { likeThese: [{ artist: 'Nirvana' }] },
    { likeThese: [{ artist: '', album: 'Nevermind' }] },
    { likeThese: [{ artist: 1, album: 'Nevermind' }] },
    { likeThese: 'Nevermind' },
  ])('ignores %j', (state) => {
    expect(vibeFromState(state)).toBeNull();
  });

  it('ignores more albums than a list holds', () => {
    const many = Array.from({ length: 11 }, () => THREE[0]);

    expect(vibeFromState(likeTheseState(many))).toBeNull();
  });
});

describe('open a list to make', () => {
  it('round-trips the list asked for', () => {
    expect(qualifierFromState(openTopThreeState('all-time'))).toBe('all-time');
    expect(qualifierFromState(openTopThreeState('genre:hip-hop'))).toBe('genre:hip-hop');
  });

  it.each([
    null,
    undefined,
    'openTopThree',
    {},
    { openTopThree: true },
    { openTopThree: 'yes' },
    { openTopThree: 'genre:polka' },
  ])('ignores %j', (state) => {
    expect(qualifierFromState(state)).toBeNull();
  });
});
