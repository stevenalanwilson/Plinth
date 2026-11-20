import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../services/artistSuggestionService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/artistSuggestionService')>()),
  suggestArtists: vi.fn(),
}));

import { handleArtistSuggestions } from './artistSuggestionsController';
import { suggestArtists } from '../services/artistSuggestionService';

const mockSuggest = vi.mocked(suggestArtists);

function makeRes(): {
  res: Response;
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const set = vi.fn();
  return { res: { json, status, set } as unknown as Response, json, status, set };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleArtistSuggestions', () => {
  it('answers with the suggestions for what was typed', async () => {
    mockSuggest.mockResolvedValue([{ id: 'a1', name: 'Talk Talk', detail: 'Group · GB' }]);
    const { res, json } = makeRes();

    await handleArtistSuggestions({ query: { q: 'talk' } } as unknown as Request, res);

    expect(mockSuggest).toHaveBeenCalledWith('talk');
    expect(json).toHaveBeenCalledWith({
      suggestions: [{ id: 'a1', name: 'Talk Talk', detail: 'Group · GB' }],
    });
  });

  it('lets an answer with suggestions in it be kept for a few minutes', async () => {
    mockSuggest.mockResolvedValue([{ id: 'a1', name: 'Talk Talk', detail: '' }]);
    const { res, set } = makeRes();

    await handleArtistSuggestions({ query: { q: 'talk' } } as unknown as Request, res);

    expect(set).toHaveBeenCalledWith('Cache-Control', 'public, max-age=300');
  });

  it('does not let an empty answer be kept, since it may only mean MusicBrainz was busy', async () => {
    mockSuggest.mockResolvedValue([]);
    const { res, set } = makeRes();

    await handleArtistSuggestions({ query: { q: 'talk' } } as unknown as Request, res);

    expect(set).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it.each([
    ['missing', {}],
    ['a list', { q: ['a', 'b'] }],
  ])('returns 400 when q is %s', async (_name, query) => {
    const { res, status } = makeRes();

    await handleArtistSuggestions({ query } as unknown as Request, res);

    expect(status).toHaveBeenCalledWith(400);
    expect(mockSuggest).not.toHaveBeenCalled();
  });
});
