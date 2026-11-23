import { describe, it, expect } from 'vitest';
import { isListId, LIST_ID_LENGTH, newListId } from './listIds';

describe('newListId', () => {
  it('makes a code of the right length that isListId accepts', () => {
    const id = newListId();

    expect(id).toHaveLength(LIST_ID_LENGTH);
    expect(isListId(id)).toBe(true);
  });

  it('does not use letters or digits that look alike', () => {
    const ids = Array.from({ length: 200 }, newListId).join('');

    expect(ids).not.toMatch(/[ilo01]/);
  });

  it('makes a different code each time', () => {
    expect(new Set(Array.from({ length: 200 }, newListId)).size).toBe(200);
  });
});

describe('isListId', () => {
  it.each([[''], ['short'], ['abcdefghjkm'], ['ABCDEFGHJK'], ['abcdefghi0'], ['abcdefgh-k']])(
    'rejects %j',
    (value) => {
      expect(isListId(value)).toBe(false);
    },
  );
});
