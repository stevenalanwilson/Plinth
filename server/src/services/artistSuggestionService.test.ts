import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../repositories/musicBrainzClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../repositories/musicBrainzClient')>()),
  musicBrainzFetch: vi.fn(),
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { musicBrainzFetch, MusicBrainzBusyError } from '../repositories/musicBrainzClient';
import { logger } from '../logger';
import { normaliseQuery, suggestArtists, suggestionPath } from './artistSuggestionService';

const mockFetch = vi.mocked(musicBrainzFetch);

function answer(artists: unknown[]): Response {
  return { ok: true, json: async (): Promise<unknown> => ({ artists }) } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normaliseQuery', () => {
  it('trims and tidies spacing', () => {
    expect(normaliseQuery('  talk   ta ')).toBe('talk ta');
  });
});

describe('suggestionPath', () => {
  function luceneOf(query: string): string {
    const path = suggestionPath(query);
    return decodeURIComponent(path.match(/query=([^&]*)/)?.[1] ?? '');
  }

  it('matches the start of the last word and every word before it', () => {
    expect(luceneOf('talk ta')).toBe('artist:(talk AND ta*)');
  });

  it('matches the start of a single word', () => {
    expect(luceneOf('nirv')).toBe('artist:(nirv*)');
  });

  it('lower-cases, so a word such as AND is not read as an operator', () => {
    expect(luceneOf('Guns AND Ro')).toBe('artist:(guns AND and AND ro*)');
  });

  it('escapes characters that mean something in a search', () => {
    expect(luceneOf('a(b')).toBe('artist:(a\\(b*)');
  });

  it('asks for a few results as JSON', () => {
    expect(suggestionPath('talk')).toContain('limit=6&fmt=json');
  });
});

describe('suggestArtists', () => {
  it('returns the artists with what tells them apart', async () => {
    mockFetch.mockResolvedValue(
      answer([
        {
          id: 'a1',
          name: 'Nirvana',
          type: 'Group',
          country: 'US',
          disambiguation: 'US grunge band',
        },
        {
          id: 'a2',
          name: 'Nirvana',
          type: 'Group',
          country: 'GB',
          disambiguation: '60s band from the UK',
        },
      ]),
    );

    await expect(suggestArtists('nirv')).resolves.toEqual([
      { id: 'a1', name: 'Nirvana', detail: 'US grunge band' },
      { id: 'a2', name: 'Nirvana', detail: '60s band from the UK' },
    ]);
  });

  it('describes an artist with no note by their kind and country', async () => {
    mockFetch.mockResolvedValue(
      answer([{ id: 'a1', name: 'Talk Talk', type: 'Group', country: 'GB' }]),
    );

    await expect(suggestArtists('talk')).resolves.toEqual([
      { id: 'a1', name: 'Talk Talk', detail: 'Group · GB' },
    ]);
  });

  it('leaves the description empty when there is nothing to say', async () => {
    mockFetch.mockResolvedValue(answer([{ id: 'a1', name: 'Talk Talk' }]));

    await expect(suggestArtists('talk')).resolves.toEqual([
      { id: 'a1', name: 'Talk Talk', detail: '' },
    ]);
  });

  it('leaves out an entry with no ID or name, and a repeat of the same artist', async () => {
    mockFetch.mockResolvedValue(
      answer([
        { name: 'No id' },
        { id: 'a0' },
        { id: 'a1', name: 'Talk Talk', disambiguation: 'band' },
        { id: 'a2', name: 'Talk Talk', disambiguation: 'band' },
      ]),
    );

    const suggestions = await suggestArtists('talk');

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual(['a1']);
  });

  it.each(['', ' ', 'a', ' a '])('does not search for %j, which is too short', async (query) => {
    await expect(suggestArtists(query)).resolves.toEqual([]);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not search for something too long to be a name', async () => {
    await expect(suggestArtists('a'.repeat(61))).resolves.toEqual([]);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('will not wait long in the line to MusicBrainz', async () => {
    mockFetch.mockResolvedValue(answer([]));

    await suggestArtists('talk');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('artist?query='),
      expect.anything(),
      { maxQueueMs: 1500 },
    );
  });

  it('gives no suggestions, quietly, when the line is busy', async () => {
    mockFetch.mockRejectedValue(new MusicBrainzBusyError());

    await expect(suggestArtists('talk')).resolves.toEqual([]);

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('gives no suggestions, and says so in the log, when MusicBrainz fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(suggestArtists('talk')).resolves.toEqual([]);

    expect(logger.warn).toHaveBeenCalledWith({ status: 503 }, 'artist suggestions failed');
  });

  it('gives no suggestions when the request throws', async () => {
    mockFetch.mockRejectedValue(new Error('timed out'));

    await expect(suggestArtists('talk')).resolves.toEqual([]);
  });
});
