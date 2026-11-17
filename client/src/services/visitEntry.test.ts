import { describe, it, expect, beforeEach } from 'vitest';
import { recordVisitEntry, takeSharedLinkEntry } from './visitEntry';

beforeEach(() => {
  sessionStorage.clear();
});

describe('visit entry', () => {
  it('sends shared-link with the first pick of a visit that began on an album page', () => {
    recordVisitEntry('/album/the-sound-jeopardy');

    expect(takeSharedLinkEntry()).toBe('shared-link');
  });

  it('sends it only once per visit', () => {
    recordVisitEntry('/album/the-sound-jeopardy');
    takeSharedLinkEntry();

    expect(takeSharedLinkEntry()).toBeUndefined();
  });

  it.each(['/', '/anything', '/album', '/album/', '/album/a/b'])(
    'sends nothing for a visit that began on %s',
    (pathname) => {
      recordVisitEntry(pathname);

      expect(takeSharedLinkEntry()).toBeUndefined();
    },
  );

  it('accepts a trailing slash on the album page', () => {
    recordVisitEntry('/album/the-sound-jeopardy/');

    expect(takeSharedLinkEntry()).toBe('shared-link');
  });

  it('keeps where the visit began, ignoring pages opened later', () => {
    recordVisitEntry('/');
    recordVisitEntry('/album/the-sound-jeopardy');

    expect(takeSharedLinkEntry()).toBeUndefined();
  });

  it('does not start counting again after a reload', () => {
    recordVisitEntry('/album/the-sound-jeopardy');
    takeSharedLinkEntry();
    recordVisitEntry('/album/the-sound-jeopardy');

    expect(takeSharedLinkEntry()).toBeUndefined();
  });

  it('sends nothing, and does not throw, when storage is unavailable', () => {
    expect(() => recordVisitEntry('/album/x', null)).not.toThrow();
    expect(takeSharedLinkEntry(null)).toBeUndefined();
  });

  it('sends nothing when storage refuses to be read', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    } as unknown as Storage;

    expect(() => recordVisitEntry('/album/x', broken)).not.toThrow();
    expect(takeSharedLinkEntry(broken)).toBeUndefined();
  });
});
