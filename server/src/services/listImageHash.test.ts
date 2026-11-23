import { describe, it, expect } from 'vitest';
import { listImageHash } from './listImageHash';

const album = (
  releaseGroupId: string,
  artworkUrl: string | null,
): {
  releaseGroupId: string;
  artworkUrl: string | null;
} => ({ releaseGroupId, artworkUrl });

const A = album('rg-a', 'https://coverartarchive.org/a.jpg');
const B = album('rg-b', 'https://coverartarchive.org/b.jpg');
const C = album('rg-c', null);

describe('listImageHash', () => {
  it('is the same for the same albums and covers', () => {
    expect(listImageHash([A, B, C])).toBe(listImageHash([A, B, C]));
  });

  it('is a short code that is safe in an address', () => {
    expect(listImageHash([A, B, C])).toMatch(/^[0-9a-f]{12}$/);
  });

  it('changes when the albums are put in another order', () => {
    expect(listImageHash([B, A, C])).not.toBe(listImageHash([A, B, C]));
  });

  it('changes when an album is swapped for another', () => {
    expect(listImageHash([A, B, album('rg-d', null)])).not.toBe(listImageHash([A, B, C]));
  });

  it('changes when a cover turns up for an album that had none, so the picture is fetched again', () => {
    const found = album('rg-c', 'https://coverartarchive.org/c.jpg');

    expect(listImageHash([A, B, found])).not.toBe(listImageHash([A, B, C]));
  });

  it('does not run one album into the next', () => {
    expect(listImageHash([album('ab', 'c'), album('d', null)])).not.toBe(
      listImageHash([album('a', 'bc'), album('d', null)]),
    );
  });
});
