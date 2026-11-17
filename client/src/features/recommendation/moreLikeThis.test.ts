import { describe, it, expect } from 'vitest';
import { moreLikeThisState, pivotFromState } from './moreLikeThis';

describe('more like this navigation state', () => {
  it('round-trips into a more-like-this pivot', () => {
    expect(pivotFromState(moreLikeThisState('The Sound', 'Jeopardy'))).toEqual({
      type: 'more-like-this',
      artist: 'The Sound',
      album: 'Jeopardy',
    });
  });

  it.each([
    null,
    undefined,
    'moreLikeThis',
    {},
    { moreLikeThis: null },
    { moreLikeThis: { artist: 'The Sound' } },
    { moreLikeThis: { artist: '', album: 'Jeopardy' } },
    { moreLikeThis: { artist: 1, album: 'Jeopardy' } },
  ])('ignores %j', (state) => {
    expect(pivotFromState(state)).toBeNull();
  });
});
