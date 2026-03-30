import { describe, it, expect } from 'vitest';
import { buildLibraryExport, parseLibraryJson, mergeHistory } from './libraryExport';
import { HistoryEntry } from '../types/history';

function makeEntry(
  artist: string,
  album: string,
  createdAt = '2025-01-15T10:00:00Z',
): HistoryEntry {
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
  it('sets version to 1 and wraps history', () => {
    const entries = [makeEntry('Burial', 'Untrue')];
    const result = buildLibraryExport(entries);

    expect(result.version).toBe(1);
    expect(result.history).toHaveLength(1);
    expect(result.history[0].recommendation.artist).toBe('Burial');
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
    const existing = makeEntry('Burial', 'Untrue', '2025-01-01T00:00:00Z');
    const imported = makeEntry('burial', 'untrue', '2024-06-01T00:00:00Z');

    const result = mergeHistory([existing], [imported]);

    expect(result).toHaveLength(1);
    // Existing entry is kept (first seen wins)
    expect(result[0].id).toBe(existing.id);
  });

  it('existing entries take precedence over imported duplicates', () => {
    const existing = makeEntry('X', 'Y', '2025-01-01T00:00:00Z');
    const imported = makeEntry('X', 'Y', '2024-01-01T00:00:00Z');
    imported.recommendation;

    const result = mergeHistory([existing], [imported]);
    expect(result[0].id).toBe(existing.id);
  });

  it('sorts result by createdAt descending', () => {
    const older = makeEntry('A', 'B', '2024-01-01T00:00:00Z');
    const newer = makeEntry('C', 'D', '2025-06-01T00:00:00Z');

    const result = mergeHistory([older], [newer]);

    expect(result[0].recommendation.artist).toBe('C');
    expect(result[1].recommendation.artist).toBe('A');
  });

  it('caps result at 50 entries', () => {
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
});
