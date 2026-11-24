import { describe, it, expect } from 'vitest';
import { describeAlbums, joinNames } from './listText';

describe('joinNames', () => {
  it.each([
    [[], ''],
    [['A'], 'A'],
    [['A', 'B'], 'A and B'],
    [['A', 'B', 'C'], 'A, B and C'],
    [['A', 'B', 'C', 'D'], 'A, B, C and D'],
  ])('joins %j as %j', (names, expected) => {
    expect(joinNames(names)).toBe(expected);
  });
});

describe('describeAlbums', () => {
  it('names each album with its artist, in order, as a sentence', () => {
    expect(
      describeAlbums([
        { album: 'Nevermind', artist: 'Nirvana' },
        { album: 'Abbey Road', artist: 'The Beatles' },
        { album: 'Kind of Blue', artist: 'Miles Davis' },
      ]),
    ).toBe('Nevermind by Nirvana, Abbey Road by The Beatles and Kind of Blue by Miles Davis.');
  });

  it('says nothing for a list with no albums', () => {
    expect(describeAlbums([])).toBe('');
  });
});
