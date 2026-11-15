import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});

vi.mock('./albumMatchService', () => ({ findAlbum: vi.fn() }));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import Anthropic from '@anthropic-ai/sdk';
import {
  getRecommendation,
  buildPrompt,
  UnverifiedRecommendationError,
} from './recommendationService';
import { AlbumQuery, findAlbum } from './albumMatchService';
import { logger } from '../logger';
import { RecommendationRequest, RecommendationPreferences } from '@shared/types';

const mockCreate = vi.fn();
const mockFindAlbum = vi.mocked(findAlbum);

beforeEach(() => {
  vi.clearAllMocks();
  (Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  // By default every pick exists, under the spelling Claude used.
  mockFindAlbum.mockImplementation(async (query: AlbumQuery) => ({
    status: 'matched',
    match: {
      releaseGroupId: 'rg-1',
      artist: query.artist,
      album: query.album,
      year: query.year ?? null,
    },
  }));
});

// Intentionally non-default values so tests verify that preferences are reflected in the prompt.
const defaultPreferences: RecommendationPreferences = {
  genres: ['Post-punk', 'Ambient'],
  moods: ['Late night', 'Melancholic'],
  tempo: 3,
  energy: 4,
  density: 5,
  era: '80s-90s',
  includeFamiliarArtists: true,
  prioritiseObscure: false,
  stayFocused: false,
};

const validRequest: RecommendationRequest = {
  preferences: defaultPreferences,
  alreadySuggested: [],
};

const validJsonResponse = JSON.stringify({
  artist: 'Massive Attack',
  album: 'Mezzanine',
  year: '1998',
  reason: 'A perfect fit for your taste.',
  genres: ['Trip-hop', 'Electronic'],
  country: 'United Kingdom',
});

describe('getRecommendation', () => {
  it('returns a parsed recommendation on success', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    const result = await getRecommendation(validRequest);

    expect(result).toMatchObject({
      artist: 'Massive Attack',
      album: 'Mezzanine',
      year: '1998',
      reason: 'A perfect fit for your taste.',
      genres: ['Trip-hop', 'Electronic'],
      country: 'United Kingdom',
    });
  });

  it('asks for structured output matching the recommendation fields', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    await getRecommendation(validRequest);

    const params = mockCreate.mock.calls[0][0] as {
      output_config: { format: { type: string; schema: { required: string[] } } };
    };
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.output_config.format.schema.required).toEqual(
      expect.arrayContaining(['artist', 'album', 'year', 'reason']),
    );
  });

  it('throws when ANTHROPIC_API_KEY is not set', async () => {
    // The service uses a lazy singleton, so we must reset modules to get a fresh one.
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY;

    // vi.doMock (not hoisted) re-registers the mock after resetModules
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: vi.fn(),
    }));

    const { getRecommendation: isolated } = await import('./recommendationService');
    await expect(isolated(validRequest)).rejects.toThrow('ANTHROPIC_API_KEY is not configured');
  });

  it('throws when response JSON is unparseable', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
    });

    await expect(getRecommendation(validRequest)).rejects.toThrow(
      'Claude response was not valid JSON',
    );
  });

  it('throws when response is missing required fields', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ artist: 'X' }) }],
    });

    await expect(getRecommendation(validRequest)).rejects.toThrow('Incomplete recommendation data');
  });

  it('includes genres in the prompt', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    await getRecommendation(validRequest);

    const callArgs = mockCreate.mock.calls[0][0];
    const prompt = callArgs.messages[0].content as string;
    expect(prompt).toContain('Post-punk');
    expect(prompt).toContain('Ambient');
  });

  it('includes mood in the prompt', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    await getRecommendation(validRequest);

    const callArgs = mockCreate.mock.calls[0][0];
    const prompt = callArgs.messages[0].content as string;
    expect(prompt).toContain('Late night');
    expect(prompt).toContain('Melancholic');
  });

  it('includes era in the prompt', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    await getRecommendation(validRequest);

    const callArgs = mockCreate.mock.calls[0][0];
    const prompt = callArgs.messages[0].content as string;
    expect(prompt).toContain('80s-90s');
  });

  it('includes tempo label in the prompt', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    // tempo: 3 → "slow"
    await getRecommendation(validRequest);

    const callArgs = mockCreate.mock.calls[0][0];
    const prompt = callArgs.messages[0].content as string;
    expect(prompt).toContain('slow');
  });

  it('uses "obscure" language when prioritiseObscure is true', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    await getRecommendation({
      ...validRequest,
      preferences: { ...defaultPreferences, prioritiseObscure: true },
    });

    const callArgs = mockCreate.mock.calls[0][0];
    const prompt = callArgs.messages[0].content as string;
    expect(prompt).toContain('lesser-known');
  });

  it('excludes already-suggested albums from the prompt', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    await getRecommendation({
      ...validRequest,
      alreadySuggested: ['Mezzanine'],
    });

    const callArgs = mockCreate.mock.calls[0][0];
    const prompt = callArgs.messages[0].content as string;
    expect(prompt).toContain('Mezzanine');
    expect(prompt).toContain('do NOT recommend');
  });

  it('omits avoid list when alreadySuggested is empty', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    await getRecommendation(validRequest);

    const callArgs = mockCreate.mock.calls[0][0];
    const prompt = callArgs.messages[0].content as string;
    expect(prompt).not.toContain('do NOT recommend');
  });
});

function claudeReply(artist: string, album: string): Record<string, unknown> {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          artist,
          album,
          year: '1980',
          reason: 'Fits.',
          genres: [],
          country: 'UK',
        }),
      },
    ],
  };
}

function promptOfCall(index: number): string {
  return mockCreate.mock.calls[index][0].messages[0].content as string;
}

describe('getRecommendation album check', () => {
  it('returns the MusicBrainz spelling, year and release group of a matched pick', async () => {
    mockCreate.mockResolvedValue(claudeReply('Sound', 'jeopardy'));
    mockFindAlbum.mockResolvedValue({
      status: 'matched',
      match: {
        releaseGroupId: 'rg-jeopardy',
        artist: 'The Sound',
        album: 'Jeopardy',
        year: '1980',
      },
    });

    const result = await getRecommendation(validRequest);

    expect(mockFindAlbum).toHaveBeenCalledWith({
      artist: 'Sound',
      album: 'jeopardy',
      year: '1980',
    });
    expect(result).toMatchObject({
      artist: 'The Sound',
      album: 'Jeopardy',
      year: '1980',
      releaseGroupId: 'rg-jeopardy',
    });
  });

  it('asks again when a pick is not found, telling Claude which album to avoid', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeReply('The Sound', 'Midnight Pylons'))
      .mockResolvedValueOnce(claudeReply('The Sound', 'Jeopardy'));
    mockFindAlbum.mockResolvedValueOnce({ status: 'not_found' });

    const result = await getRecommendation(validRequest);

    expect(result.album).toBe('Jeopardy');
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(promptOfCall(1)).toContain('could not be found in MusicBrainz');
    expect(promptOfCall(1)).toContain('The Sound – Midnight Pylons');
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'not_found', attempt: 1, album: 'Midnight Pylons' }),
      'recommendation regenerated',
    );
  });

  it('returns the pick unchecked when MusicBrainz is unavailable', async () => {
    mockCreate.mockResolvedValue(claudeReply('The Sound', 'Jeopardy'));
    mockFindAlbum.mockResolvedValue({ status: 'lookup_failed' });

    const result = await getRecommendation(validRequest);

    expect(result.album).toBe('Jeopardy');
    expect(result.releaseGroupId).toBeUndefined();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('gives up after three picks that cannot be found', async () => {
    mockCreate.mockResolvedValue(claudeReply('Nobody', 'Nothing'));
    mockFindAlbum.mockResolvedValue({ status: 'not_found' });

    await expect(getRecommendation(validRequest)).rejects.toBeInstanceOf(
      UnverifiedRecommendationError,
    );
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('asks again for a duplicate without looking it up', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeReply('Massive Attack', 'Mezzanine'))
      .mockResolvedValueOnce(claudeReply('Burial', 'Untrue'));

    const result = await getRecommendation({
      ...validRequest,
      alreadySuggested: ['Massive Attack – Mezzanine'],
    });

    expect(result.album).toBe('Untrue');
    expect(mockFindAlbum).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'duplicate', attempt: 1 }),
      'recommendation regenerated',
    );
  });

  it('falls back to a duplicate when no new pick can be verified', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeReply('Massive Attack', 'Mezzanine'))
      .mockResolvedValue(claudeReply('Nobody', 'Nothing'));
    mockFindAlbum.mockResolvedValue({ status: 'not_found' });

    const result = await getRecommendation({
      ...validRequest,
      alreadySuggested: ['Massive Attack – Mezzanine'],
    });

    expect(result.album).toBe('Mezzanine');
  });
});

describe('buildPrompt pivot hint', () => {
  const baseRequest: RecommendationRequest = {
    preferences: {
      genres: [],
      moods: [],
      tempo: 5,
      energy: 5,
      density: 5,
      era: 'any',
      includeFamiliarArtists: true,
      prioritiseObscure: false,
      stayFocused: false,
    },
    alreadySuggested: [],
  };

  it('includes "similar vein" language for more-like-this pivot', () => {
    const prompt = buildPrompt({
      ...baseRequest,
      pivot: { type: 'more-like-this', artist: 'Burial', album: 'Untrue' },
    });
    expect(prompt).toContain('"Burial – Untrue"');
    expect(prompt).toContain('similar vein');
  });

  it('includes "meaningfully different" language for something-different pivot', () => {
    const prompt = buildPrompt({
      ...baseRequest,
      pivot: { type: 'something-different', artist: 'Burial', album: 'Untrue' },
    });
    expect(prompt).toContain('"Burial – Untrue"');
    expect(prompt).toContain('meaningfully different');
  });

  it('includes no pivot language when pivot is absent', () => {
    const prompt = buildPrompt(baseRequest);
    expect(prompt).not.toContain('similar vein');
    expect(prompt).not.toContain('meaningfully different');
  });
});

describe('genres and country parsing', () => {
  it('includes genres and country when present in response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    const result = await getRecommendation(validRequest);

    expect(result.genres).toEqual(['Trip-hop', 'Electronic']);
    expect(result.country).toBe('United Kingdom');
  });

  it('omits genres when not present in response', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ artist: 'X', album: 'Y', year: '2000', reason: 'Good.' }),
        },
      ],
    });

    const result = await getRecommendation(validRequest);

    expect(result.genres).toBeUndefined();
    expect(result.country).toBeUndefined();
  });

  it('filters non-string entries from genres array', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            artist: 'X',
            album: 'Y',
            year: '2000',
            reason: 'Good.',
            genres: ['Rock', 42, null, 'Jazz'],
            country: 'USA',
          }),
        },
      ],
    });

    const result = await getRecommendation(validRequest);

    expect(result.genres).toEqual(['Rock', 'Jazz']);
  });
});

describe('buildPrompt vibeQuery', () => {
  const baseRequest: RecommendationRequest = {
    preferences: {
      genres: [],
      moods: [],
      tempo: 5,
      energy: 5,
      density: 5,
      era: 'any',
      includeFamiliarArtists: true,
      prioritiseObscure: false,
      stayFocused: false,
    },
    alreadySuggested: [],
  };

  it('includes vibe query text in the prompt when set', () => {
    const prompt = buildPrompt({
      ...baseRequest,
      vibeQuery: 'Blink-182 but with Morrissey on vocals',
    });
    expect(prompt).toContain('Blink-182 but with Morrissey on vocals');
  });

  it('includes "primary creative brief" language when vibeQuery is set', () => {
    const prompt = buildPrompt({
      ...baseRequest,
      vibeQuery: 'Something like Bootsy Collins but on even better acid',
    });
    expect(prompt).toContain('primary creative brief');
  });

  it('does not include vibe language when vibeQuery is absent', () => {
    const prompt = buildPrompt(baseRequest);
    expect(prompt).not.toContain('primary creative brief');
    expect(prompt).not.toContain('described their vibe');
  });
});

describe('buildPrompt seedArtist', () => {
  const baseRequest: RecommendationRequest = {
    preferences: {
      genres: [],
      moods: [],
      tempo: 5,
      energy: 5,
      density: 5,
      era: 'any',
      includeFamiliarArtists: true,
      prioritiseObscure: false,
      stayFocused: false,
    },
    alreadySuggested: [],
  };

  it('includes artist name and catalogue language when seedArtist is set', () => {
    const prompt = buildPrompt({ ...baseRequest, seedArtist: 'Four Tet' });
    expect(prompt).toContain('Four Tet');
    expect(prompt).toContain('catalogue');
  });

  it('does not include seed language when seedArtist is absent', () => {
    const prompt = buildPrompt(baseRequest);
    expect(prompt).not.toContain('catalogue');
  });
});
