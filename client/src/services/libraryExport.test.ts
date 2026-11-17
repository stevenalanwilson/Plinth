import { describe, it, expect } from 'vitest';
import { buildLibraryExport, parseLibraryJson, mergeHistory } from './libraryExport';
import { HistoryEntry } from '../types/history';
import { Feedback } from '../types/feedback';

const DAY_MS = 24 * 60 * 60 * 1000;

// Dates are relative to now because entries older than 90 days that nobody rated are dropped.
function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function makeEntry(artist: string, album: string, createdAt = daysAgo(10)): HistoryEntry {
  return {
    id: crypto.randomUUID(),
    createdAt,
    recommendation: { artist, album, year: '2000', reason: 'Good.' },
    artworkResponse: { artworkUrl: null, year: '2000', appleMusicUrl: null },
  };
}

function toJson(content: unknown): string {
  return JSON.stringify(content);
}

// ── buildLibraryExport ────────────────────────────────────────────────────────

describe('buildLibraryExport', () => {
  it('sets version to 2 and wraps history', () => {
    const entries = [makeEntry('Burial', 'Untrue')];
    const result = buildLibraryExport(entries);

    expect(result.version).toBe(2);
    expect(result.history).toHaveLength(1);
    expect(result.history[0].recommendation.artist).toBe('Burial');
  });

  it('carries each album’s feedback', () => {
    const feedback: Feedback = { status: 'own', at: daysAgo(2) };
    const result = buildLibraryExport([{ ...makeEntry('Burial', 'Untrue'), feedback }]);

    expect(result.history[0].feedback).toEqual(feedback);
  });

  it('includes an exportedAt ISO timestamp', () => {
    const result = buildLibraryExport([]);
    expect(() => new Date(result.exportedAt)).not.toThrow();
    expect(result.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ── parseLibraryJson ──────────────────────────────────────────────────────────

describe('parseLibraryJson', () => {
  it('parses a valid export file and returns entries with fresh UUIDs', () => {
    const original = makeEntry('Burial', 'Untrue');
    const json = toJson({ version: 1, exportedAt: new Date().toISOString(), history: [original] });

    const result = parseLibraryJson(json);

    expect(result).toHaveLength(1);
    expect(result[0].recommendation.artist).toBe('Burial');
    // Fresh UUID — different from original
    expect(result[0].id).not.toBe(original.id);
  });

  it('throws on non-JSON input', () => {
    expect(() => parseLibraryJson('not json!!')).toThrow('valid JSON');
  });

  it('throws when history key is missing', () => {
    expect(() => parseLibraryJson(toJson({ version: 1 }))).toThrow('history array');
  });

  it('throws when history is not an array', () => {
    expect(() => parseLibraryJson(toJson({ history: 'not-an-array' }))).toThrow('history array');
  });

  it('throws when an entry is missing required recommendation fields', () => {
    expect(() =>
      parseLibraryJson(toJson({ history: [{ recommendation: { artist: 'Burial' } }] })),
    ).toThrow('missing required fields');
  });

  it('preserves valid createdAt from the file', () => {
    const ts = '2024-06-01T12:00:00Z';
    const result = parseLibraryJson(toJson({ history: [{ ...makeEntry('X', 'Y', ts) }] }));
    expect(result[0].createdAt).toBe(ts);
  });

  it('falls back to current time when createdAt is invalid', () => {
    const before = Date.now();
    const entry = { ...makeEntry('X', 'Y'), createdAt: 'not-a-date' };
    const result = parseLibraryJson(toJson({ history: [entry] }));
    expect(Date.parse(result[0].createdAt)).toBeGreaterThanOrEqual(before);
  });

  it('preserves optional genres and country', () => {
    const entry = makeEntry('X', 'Y');
    const withExtras = {
      ...entry,
      recommendation: { ...entry.recommendation, genres: ['Jazz'], country: 'USA' },
    };
    const result = parseLibraryJson(toJson({ history: [withExtras] }));
    expect(result[0].recommendation.genres).toEqual(['Jazz']);
    expect(result[0].recommendation.country).toBe('USA');
  });

  it('keeps the permalink, hook and MusicBrainz ID', () => {
    const entry = makeEntry('The Sound', 'Jeopardy');
    const withLinks = {
      ...entry,
      recommendation: {
        ...entry.recommendation,
        slug: 'the-sound-jeopardy',
        hook: 'Post-punk with its heart on its sleeve.',
        releaseGroupId: 'rg-1',
      },
    };

    const [result] = parseLibraryJson(toJson({ version: 2, history: [withLinks] }));

    expect(result.recommendation).toMatchObject({
      slug: 'the-sound-jeopardy',
      hook: 'Post-punk with its heart on its sleeve.',
      releaseGroupId: 'rg-1',
    });
  });

  it('leaves out a permalink, hook or release group that is empty or not a string', () => {
    const entry = makeEntry('X', 'Y');
    const odd = {
      ...entry,
      recommendation: { ...entry.recommendation, slug: '', hook: 5, releaseGroupId: null },
    };

    const [result] = parseLibraryJson(toJson({ history: [odd] }));

    expect(result.recommendation).not.toHaveProperty('slug');
    expect(result.recommendation).not.toHaveProperty('hook');
    expect(result.recommendation).not.toHaveProperty('releaseGroupId');
  });

  it('keeps each album’s feedback, including a cleared rating', () => {
    const owned: Feedback = { status: 'own', at: daysAgo(3) };
    const cleared: Feedback = { status: null, at: daysAgo(1) };
    const history = [
      { ...makeEntry('A', 'One'), feedback: owned },
      { ...makeEntry('B', 'Two'), feedback: cleared },
    ];

    const result = parseLibraryJson(toJson({ version: 2, history }));

    expect(result[0].feedback).toEqual(owned);
    expect(result[1].feedback).toEqual(cleared);
  });

  it('still imports a version 1 file, which has no feedback', () => {
    const history = [makeEntry('Burial', 'Untrue')];

    const result = parseLibraryJson(toJson({ version: 1, exportedAt: daysAgo(1), history }));

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('feedback');
  });

  it('imports an album whose feedback is malformed, without the feedback', () => {
    const entry = { ...makeEntry('X', 'Y'), feedback: { status: 'loved', at: 'sometime' } };

    const result = parseLibraryJson(toJson({ history: [entry] }));

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('feedback');
  });

  it('round-trips an export, feedback and permalinks included', () => {
    const entry = makeEntry('The Sound', 'Jeopardy');
    const original: HistoryEntry = {
      ...entry,
      recommendation: {
        ...entry.recommendation,
        slug: 'the-sound-jeopardy',
        releaseGroupId: 'rg-1',
      },
      feedback: { status: 'want-vinyl', at: daysAgo(1) },
    };

    const [result] = parseLibraryJson(JSON.stringify(buildLibraryExport([original])));

    expect(result).toEqual({ ...original, id: result.id });
  });

  it('skips entries that are not objects', () => {
    const valid = makeEntry('X', 'Y');
    const result = parseLibraryJson(toJson({ history: [null, 42, valid] }));
    expect(result).toHaveLength(1);
  });
});

// ── mergeHistory ──────────────────────────────────────────────────────────────

describe('mergeHistory', () => {
  it('returns all entries when there are no duplicates', () => {
    const a = makeEntry('Artist A', 'Album A');
    const b = makeEntry('Artist B', 'Album B');
    expect(mergeHistory([a], [b])).toHaveLength(2);
  });

  it('deduplicates by artist+album case-insensitively', () => {
    const existing = makeEntry('Burial', 'Untrue', daysAgo(10));
    const imported = makeEntry('burial', 'untrue', daysAgo(20));

    const result = mergeHistory([existing], [imported]);

    expect(result).toHaveLength(1);
    // Existing entry is kept (first seen wins)
    expect(result[0].id).toBe(existing.id);
  });

  it('existing entries take precedence over imported duplicates', () => {
    const existing = makeEntry('X', 'Y', daysAgo(10));
    const imported = makeEntry('X', 'Y', daysAgo(20));

    const result = mergeHistory([existing], [imported]);
    expect(result[0].id).toBe(existing.id);
  });

  it('sorts result by createdAt descending', () => {
    const older = makeEntry('A', 'B', daysAgo(30));
    const newer = makeEntry('C', 'D', daysAgo(5));

    const result = mergeHistory([older], [newer]);

    expect(result[0].recommendation.artist).toBe('C');
    expect(result[1].recommendation.artist).toBe('A');
  });

  it('keeps only the newest 50 unrated entries', () => {
    const existing = Array.from({ length: 40 }, (_, i) => makeEntry(`Artist${i}`, `Album${i}`));
    const imported = Array.from({ length: 20 }, (_, i) => makeEntry(`New${i}`, `New${i}`));

    const result = mergeHistory(existing, imported);
    expect(result).toHaveLength(50);
  });

  it('returns a copy — does not mutate inputs', () => {
    const existing = [makeEntry('X', 'Y')];
    const imported = [makeEntry('Z', 'W')];
    const existingCopy = [...existing];

    mergeHistory(existing, imported);

    expect(existing).toEqual(existingCopy);
  });

  it('treats two picks of the same release group as one album, even under different spellings', () => {
    const withGroup = (artist: string, album: string): HistoryEntry => {
      const entry = makeEntry(artist, album);
      return { ...entry, recommendation: { ...entry.recommendation, releaseGroupId: 'rg-1' } };
    };
    const existing = withGroup('Gil Scott‐Heron', 'Pieces of a Man');
    const imported = withGroup('Gil Scott-Heron', 'Pieces of a Man');

    const result = mergeHistory([existing], [imported]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(existing.id);
  });

  it('matches an older pick that has no release group to the same album with one', () => {
    const existing = makeEntry('The Sound', 'Jeopardy');
    const imported = makeEntry('the sound', 'jeopardy');
    const importedWithGroup = {
      ...imported,
      recommendation: { ...imported.recommendation, releaseGroupId: 'rg-1' },
    };

    expect(mergeHistory([existing], [importedWithGroup])).toHaveLength(1);
  });

  describe('feedback', () => {
    const OLDER: Feedback = { status: 'save', at: daysAgo(5) };
    const NEWER: Feedback = { status: 'own', at: daysAgo(2) };

    function rated(feedback: Feedback | undefined, album = 'Untrue'): HistoryEntry {
      return { ...makeEntry('Burial', album), ...(feedback ? { feedback } : {}) };
    }

    it('takes the imported rating when it is newer', () => {
      const existing = rated(OLDER);

      const [result] = mergeHistory([existing], [rated(NEWER)]);

      expect(result.id).toBe(existing.id);
      expect(result.feedback).toEqual(NEWER);
    });

    it('keeps the existing rating when it is newer', () => {
      const [result] = mergeHistory([rated(NEWER)], [rated(OLDER)]);

      expect(result.feedback).toEqual(NEWER);
    });

    it('takes the imported rating when the existing album has none', () => {
      const [result] = mergeHistory([rated(undefined)], [rated(OLDER)]);

      expect(result.feedback).toEqual(OLDER);
    });

    it('keeps the existing rating when the imported album has none', () => {
      const [result] = mergeHistory([rated(OLDER)], [rated(undefined)]);

      expect(result.feedback).toEqual(OLDER);
    });

    it('lets a newer cleared rating beat an older status, so it stays cleared', () => {
      const cleared: Feedback = { status: null, at: daysAgo(1) };

      const [result] = mergeHistory([rated(OLDER)], [rated(cleared)]);

      expect(result.feedback).toEqual(cleared);
    });

    it('compares times, not text, so differently written dates are ordered correctly', () => {
      const withOffset: Feedback = { status: 'heard', at: '2099-01-01T00:30:00+01:00' };
      const utcLater: Feedback = { status: 'own', at: '2099-01-01T00:00:00Z' };

      // 00:30 at +01:00 is 23:30 UTC the day before, so the UTC one is later.
      const [result] = mergeHistory([rated(withOffset)], [rated(utcLater)]);

      expect(result.feedback).toEqual(utcLater);
    });

    it('does not change the entries it was given', () => {
      const existing = rated(OLDER);
      const imported = rated(NEWER);

      mergeHistory([existing], [imported]);

      expect(existing.feedback).toEqual(OLDER);
    });
  });

  describe('retention', () => {
    it('keeps a rated album from an old backup', () => {
      const owned: Feedback = { status: 'own', at: daysAgo(300) };
      const old = { ...makeEntry('Burial', 'Untrue', daysAgo(400)), feedback: owned };

      expect(mergeHistory([], [old])).toHaveLength(1);
    });

    it('drops an unrated pick from an old backup, as it would be dropped in normal use', () => {
      const old = makeEntry('Burial', 'Untrue', daysAgo(400));

      expect(mergeHistory([], [old])).toHaveLength(0);
    });

    it('keeps every rated album however many there are, and caps only the unrated', () => {
      const owned: Feedback = { status: 'own', at: daysAgo(1) };
      const rated = Array.from({ length: 60 }, (_, i) => ({
        ...makeEntry(`Rated${i}`, `Rated${i}`),
        feedback: owned,
      }));
      const unrated = Array.from({ length: 70 }, (_, i) => makeEntry(`Pick${i}`, `Pick${i}`));

      const result = mergeHistory(rated, unrated);

      expect(result.filter((entry) => entry.feedback)).toHaveLength(60);
      expect(result.filter((entry) => !entry.feedback)).toHaveLength(50);
    });
  });
});
