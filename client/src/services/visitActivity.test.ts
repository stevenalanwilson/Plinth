import { describe, it, expect, beforeEach } from 'vitest';
import { recordRating, startPick } from './visitActivity';

beforeEach(() => {
  sessionStorage.clear();
});

describe('startPick', () => {
  it('starts a visit at its first pick, with nothing answered', () => {
    expect(startPick()).toEqual({ pickNumber: 1, ratedThisVisit: 0 });
  });

  it('counts each pick in the visit', () => {
    startPick();
    startPick();

    expect(startPick().pickNumber).toBe(3);
  });

  it('reports how many different albums have been answered so far', () => {
    expect(startPick().ratedThisVisit).toBe(0);

    recordRating('album-1');
    recordRating('album-2');

    expect(startPick()).toEqual({ pickNumber: 2, ratedThisVisit: 2 });
  });

  it('starts again in a new tab session', () => {
    startPick();
    recordRating('album-1');

    sessionStorage.clear();

    expect(startPick()).toEqual({ pickNumber: 1, ratedThisVisit: 0 });
  });

  it('starts over when the stored count is not a number', () => {
    sessionStorage.setItem('plinth-visit-picks', 'lots');

    expect(startPick().pickNumber).toBe(1);
  });

  it.each(['0', '-4'])('starts over when the stored count is %s', (stored) => {
    sessionStorage.setItem('plinth-visit-picks', stored);

    expect(startPick().pickNumber).toBe(1);
  });
});

describe('recordRating', () => {
  it('counts an album once, however often its answer changes', () => {
    recordRating('album-1');
    recordRating('album-1');
    recordRating('album-1');

    expect(startPick().ratedThisVisit).toBe(1);
  });

  it('counts different albums separately', () => {
    ['a', 'b', 'c'].forEach((id) => recordRating(id));

    expect(startPick().ratedThisVisit).toBe(3);
  });

  it('ignores stored ratings that are not album ids', () => {
    sessionStorage.setItem('plinth-visit-rated', JSON.stringify(['a', 4, null, 'b']));

    expect(startPick().ratedThisVisit).toBe(2);
  });

  it.each(['not json', '{"a":1}', '"a"', ''])(
    'starts over when the stored ratings are %j',
    (stored) => {
      sessionStorage.setItem('plinth-visit-rated', stored);

      recordRating('album-1');

      expect(startPick().ratedThisVisit).toBe(1);
    },
  );
});

describe('when the tab cannot keep count', () => {
  const broken = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('SecurityError');
    },
  } as unknown as Storage;

  it('sends nothing, so it is not mistaken for a visit that answered nothing', () => {
    expect(startPick(null)).toEqual({});
    expect(startPick(broken)).toEqual({});
  });

  it('does not throw when an answer is noted', () => {
    expect(() => recordRating('album-1', null)).not.toThrow();
    expect(() => recordRating('album-1', broken)).not.toThrow();
  });

  it('sends nothing when the count cannot be saved', () => {
    const readOnly = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as unknown as Storage;

    expect(startPick(readOnly)).toEqual({});
  });
});
