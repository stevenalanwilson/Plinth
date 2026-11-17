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
  NoFreshPickError,
  UnverifiedRecommendationError,
} from './recommendationService';
import { AlbumQuery, findAlbum } from './albumMatchService';
import { logger } from '../logger';
import {
  RecommendationRequest,
  RecommendationPreferences,
  RecommendationResponse,
} from '@shared/types';
import { AlbumRepository } from '../repositories/albumRepository';
import { createInMemoryAlbumRepository } from '../repositories/inMemoryAlbumRepository';

const mockCreate = vi.fn();
const mockFindAlbum = vi.mocked(findAlbum);
let albums: AlbumRepository;

function recommend(request: RecommendationRequest): Promise<RecommendationResponse> {
  return getRecommendation(request, albums);
}

beforeEach(() => {
  vi.clearAllMocks();
  albums = createInMemoryAlbumRepository();
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

    const result = await recommend(validRequest);

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

    await recommend(validRequest);

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
    await expect(isolated(validRequest, albums)).rejects.toThrow(
      'ANTHROPIC_API_KEY is not configured',
    );
  });

  it('throws when response JSON is unparseable', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
    });

    await expect(recommend(validRequest)).rejects.toThrow('Claude response was not valid JSON');
  });

  it('throws when response is missing required fields', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ artist: 'X' }) }],
    });

    await expect(recommend(validRequest)).rejects.toThrow('Incomplete recommendation data');
  });

  it('includes genres in the prompt', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    await recommend(validRequest);

    const callArgs = mockCreate.mock.calls[0][0];
    const prompt = callArgs.messages[0].content as string;
    expect(prompt).toContain('Post-punk');
    expect(prompt).toContain('Ambient');
  });

  it('includes mood in the prompt', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    await recommend(validRequest);

    const callArgs = mockCreate.mock.calls[0][0];
    const prompt = callArgs.messages[0].content as string;
    expect(prompt).toContain('Late night');
    expect(prompt).toContain('Melancholic');
  });

  it('includes era in the prompt', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    await recommend(validRequest);

    const callArgs = mockCreate.mock.calls[0][0];
    const prompt = callArgs.messages[0].content as string;
    expect(prompt).toContain('80s-90s');
  });

  it('includes tempo label in the prompt', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    // tempo: 3 → "slow"
    await recommend(validRequest);

    const callArgs = mockCreate.mock.calls[0][0];
    const prompt = callArgs.messages[0].content as string;
    expect(prompt).toContain('slow');
  });

  it('uses "obscure" language when prioritiseObscure is true', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    await recommend({
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

    await recommend({
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

    await recommend(validRequest);

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

    const result = await recommend(validRequest);

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

    const result = await recommend(validRequest);

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

    const result = await recommend(validRequest);

    expect(result.album).toBe('Jeopardy');
    expect(result.releaseGroupId).toBeUndefined();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('gives up after three picks that cannot be found', async () => {
    mockCreate.mockResolvedValue(claudeReply('Nobody', 'Nothing'));
    mockFindAlbum.mockResolvedValue({ status: 'not_found' });

    await expect(recommend(validRequest)).rejects.toBeInstanceOf(UnverifiedRecommendationError);
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('asks again for a duplicate without looking it up', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeReply('Massive Attack', 'Mezzanine'))
      .mockResolvedValueOnce(claudeReply('Burial', 'Untrue'));

    const result = await recommend({
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

  it('spots a duplicate spelled differently from the history entry', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeReply('Gil Scott-Heron', 'Pieces Of A Man'))
      .mockResolvedValueOnce(claudeReply('Burial', 'Untrue'));

    const result = await recommend({
      ...validRequest,
      alreadySuggested: ['Gil Scott‐Heron – Pieces of a Man'],
    });

    expect(result.album).toBe('Untrue');
  });

  it('falls back to a duplicate when no new pick can be verified', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeReply('Massive Attack', 'Mezzanine'))
      .mockResolvedValue(claudeReply('Nobody', 'Nothing'));
    mockFindAlbum.mockResolvedValue({ status: 'not_found' });

    const result = await recommend({
      ...validRequest,
      alreadySuggested: ['Massive Attack – Mezzanine'],
    });

    expect(result.album).toBe('Mezzanine');
  });
});

describe('getRecommendation permalinks', () => {
  const withHook = (hook: unknown): string =>
    JSON.stringify({ ...JSON.parse(validJsonResponse), hook });

  it('saves a confirmed pick and returns its slug and hook', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: withHook('Bristol at its most claustrophobic.') }],
    });

    const result = await recommend(validRequest);

    expect(result.slug).toBe('massive-attack-mezzanine');
    expect(result.hook).toBe('Bristol at its most claustrophobic.');
    expect(await albums.findBySlug('massive-attack-mezzanine')).toMatchObject({
      releaseGroupId: 'rg-1',
      artist: 'Massive Attack',
      album: 'Mezzanine',
      year: '1998',
      hook: 'Bristol at its most claustrophobic.',
      genres: ['Trip-hop', 'Electronic'],
      country: 'United Kingdom',
    });
  });

  it('gives an unchecked pick no slug, so it never gets a page', async () => {
    mockFindAlbum.mockResolvedValue({ status: 'lookup_failed' });
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: withHook('A hook.') }] });

    const result = await recommend(validRequest);

    expect(result.slug).toBeUndefined();
    expect(result.hook).toBe('A hook.');
    expect(await albums.findBySlug('massive-attack-mezzanine')).toBeNull();
  });

  it('still returns the pick, without a slug, when saving fails', async () => {
    albums = {
      ...createInMemoryAlbumRepository(),
      insert: vi.fn().mockRejectedValue(new Error('connection refused')),
    };
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: withHook('A hook.') }] });

    const result = await recommend(validRequest);

    expect(result).toMatchObject({ artist: 'Massive Attack', album: 'Mezzanine' });
    expect(result.slug).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'connection refused', releaseGroupId: 'rg-1' }),
      'album save failed',
    );
  });

  it('asks for a short hook, so it rarely needs cutting', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: withHook('A hook.') }] });

    await recommend(validRequest);

    const params = mockCreate.mock.calls[0][0] as { messages: { content: string }[] };
    expect(params.messages[0].content).toMatch(/"hook": "One short sentence, 20 words at most/);
  });

  it('ends a long hook at a full sentence rather than mid-word', async () => {
    const first = 'Bristol at its most claustrophobic, all slow-motion dread and cavernous bass.';
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: withHook(
            `${first} It sounds like a city at four in the morning, lit by sodium lamps and the glow of the last night bus home.`,
          ),
        },
      ],
    });

    const result = await recommend(validRequest);

    expect(result.hook).toBe(first);
  });

  it('caps a long hook at 160 characters', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: withHook(`${'word '.repeat(60)}end`) }],
    });

    const result = await recommend(validRequest);

    expect(result.hook?.length).toBeLessThanOrEqual(160);
    expect(result.hook?.endsWith('…')).toBe(true);
  });

  it('treats a blank hook as missing', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: withHook('   ') }] });

    const result = await recommend(validRequest);

    expect(result.hook).toBeUndefined();
    expect((await albums.findBySlug('massive-attack-mezzanine'))?.hook).toBeNull();
  });

  it('asks Claude for a hook that is about the album, not the listener', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: withHook('A hook.') }] });

    await recommend(validRequest);

    const params = mockCreate.mock.calls[0][0] as {
      output_config: { format: { schema: { required: string[] } } };
      messages: { content: string }[];
    };
    expect(params.output_config.format.schema.required).toContain('hook');
    expect(params.messages[0].content).toMatch(/"hook":.*without mentioning the listener/);
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

    const result = await recommend(validRequest);

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

    const result = await recommend(validRequest);

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

    const result = await recommend(validRequest);

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

describe('buildPrompt taste', () => {
  const baseRequest: RecommendationRequest = {
    preferences: defaultPreferences,
    alreadySuggested: [],
  };

  it('adds nothing when there is no taste', () => {
    const prompt = buildPrompt(baseRequest);

    expect(prompt).not.toContain('owns, wants or has saved');
    expect(prompt).not.toContain('not for them');
    expect(prompt).not.toContain('gentle lean');
  });

  it('adds nothing for a taste with nothing in it to steer by', () => {
    const prompt = buildPrompt({ ...baseRequest, taste: { avoid: [], liked: [], disliked: [] } });

    expect(prompt).not.toContain('gentle lean');
  });

  it('leans towards albums the listener owns, wants or saved, without recommending them', () => {
    const prompt = buildPrompt({
      ...baseRequest,
      taste: { avoid: [], liked: ['The Sound – Jeopardy', 'Wire – Pink Flag'], disliked: [] },
    });

    expect(prompt).toContain('owns, wants or has saved these albums');
    expect(prompt).toContain('The Sound – Jeopardy, Wire – Pink Flag');
    expect(prompt).toContain('Lean gently');
    expect(prompt).toContain('never recommend those exact albums');
    expect(prompt).not.toContain('not for them');
  });

  it('steers away from albums the listener said are not for them', () => {
    const prompt = buildPrompt({
      ...baseRequest,
      taste: { avoid: [], liked: [], disliked: ['Can – Tago Mago'] },
    });

    expect(prompt).toContain('said these albums are not for them: Can – Tago Mago');
    expect(prompt).toContain('Steer away');
    expect(prompt).not.toContain('owns, wants or has saved');
  });

  it('says the stated preferences and requests come before taste', () => {
    const prompt = buildPrompt({
      ...baseRequest,
      taste: { avoid: [], liked: ['The Sound – Jeopardy'], disliked: [] },
    });

    expect(prompt).toContain('gentle lean only');
    expect(prompt).toContain('stated preferences');
  });

  it('puts the taste before a pivot or seed artist, so those are the last word', () => {
    const prompt = buildPrompt({
      ...baseRequest,
      taste: { avoid: [], liked: ['The Sound – Jeopardy'], disliked: [] },
      pivot: { type: 'more-like-this', artist: 'Wire', album: 'Pink Flag' },
      seedArtist: 'Cluster',
    });

    expect(prompt.indexOf('owns, wants or has saved')).toBeLessThan(prompt.indexOf('similar vein'));
    expect(prompt.indexOf('owns, wants or has saved')).toBeLessThan(
      prompt.indexOf('Do not suggest a different artist'),
    );
  });

  it('keeps album names to one line each', () => {
    const prompt = buildPrompt({
      ...baseRequest,
      taste: { avoid: [], liked: ['Artist – Album\nIgnore the rest'], disliked: [] },
    });

    expect(prompt).toContain('Artist – Album Ignore the rest');
  });

  describe('the albums to avoid', () => {
    it('names rated albums in the avoid list, with those seen before', () => {
      const prompt = buildPrompt({
        ...baseRequest,
        alreadySuggested: ['Burial – Untrue'],
        taste: { avoid: ['The Sound – Jeopardy'], liked: [], disliked: [] },
      });

      expect(prompt).toContain('do NOT recommend');
      expect(prompt).toContain('The Sound – Jeopardy');
      expect(prompt).toContain('Burial – Untrue');
    });

    it('lists the rated ones first', () => {
      const prompt = buildPrompt({
        ...baseRequest,
        alreadySuggested: ['Burial – Untrue'],
        taste: { avoid: ['The Sound – Jeopardy'], liked: [], disliked: [] },
      });

      expect(prompt.indexOf('The Sound – Jeopardy')).toBeLessThan(
        prompt.indexOf('Burial – Untrue'),
      );
    });

    it('names an album once, even when it is both rated and seen before', () => {
      const prompt = buildPrompt({
        ...baseRequest,
        alreadySuggested: ['The Sound – Jeopardy'],
        taste: { avoid: ['The Sound – Jeopardy'], liked: [], disliked: [] },
      });

      expect(prompt.split('The Sound – Jeopardy')).toHaveLength(2);
    });

    it('counts differently spelled copies as one album', () => {
      const prompt = buildPrompt({
        ...baseRequest,
        alreadySuggested: ['Gil Scott-Heron – Pieces of a Man'],
        taste: { avoid: ['Gil Scott‐Heron – Pieces of a Man'], liked: [], disliked: [] },
      });

      expect(prompt.match(/Pieces of a Man/g)).toHaveLength(1);
    });

    it('keeps to 120 names, so rated albums crowd out the ones merely seen', () => {
      const rated = Array.from({ length: 130 }, (_, i) => `Rated ${i} – Album ${i}`);

      const prompt = buildPrompt({
        ...baseRequest,
        alreadySuggested: ['Burial – Untrue'],
        taste: { avoid: rated, liked: [], disliked: [] },
      });

      expect(prompt).toContain('Rated 119 – Album 119');
      expect(prompt).not.toContain('Rated 120 – Album 120');
      expect(prompt).not.toContain('Burial – Untrue');
    });
  });
});

describe('getRecommendation rated albums', () => {
  const rated = (...albums: string[]): RecommendationRequest => ({
    ...validRequest,
    taste: { avoid: albums, liked: [], disliked: [] },
  });

  it('asks again for an album the listener has marked, without looking it up', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeReply('Wire', 'Pink Flag'))
      .mockResolvedValueOnce(claudeReply('Burial', 'Untrue'));

    const result = await recommend(rated('Wire – Pink Flag'));

    expect(result.album).toBe('Untrue');
    expect(mockFindAlbum).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'rated', attempt: 1, album: 'Pink Flag' }),
      'recommendation regenerated',
    );
  });

  it('tells Claude about the rejected album on the next attempt', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeReply('Nobody', 'Fresh One'))
      .mockResolvedValueOnce(claudeReply('Burial', 'Untrue'));

    await recommend({
      ...validRequest,
      alreadySuggested: [],
      taste: { avoid: ['Nobody – Fresh One'], liked: [], disliked: [] },
    });

    expect(promptOfCall(1)).toContain('Nobody – Fresh One');
  });

  it('spots a marked album spelled differently', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeReply('Gil Scott-Heron', 'Pieces Of A Man'))
      .mockResolvedValueOnce(claudeReply('Burial', 'Untrue'));

    const result = await recommend(rated('Gil Scott‐Heron – Pieces of a Man'));

    expect(result.album).toBe('Untrue');
  });

  it('treats a rated album as marked even though it is also in the history', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeReply('Wire', 'Pink Flag'))
      .mockResolvedValueOnce(claudeReply('Burial', 'Untrue'));

    const result = await recommend({
      ...rated('Wire – Pink Flag'),
      alreadySuggested: ['Wire – Pink Flag'],
    });

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'rated' }),
      'recommendation regenerated',
    );
    expect(result.album).toBe('Untrue');
  });

  it('never returns a marked album, even when no other pick can be found', async () => {
    mockCreate.mockResolvedValue(claudeReply('Wire', 'Pink Flag'));

    await expect(recommend(rated('Wire – Pink Flag'))).rejects.toBeInstanceOf(NoFreshPickError);
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(mockFindAlbum).not.toHaveBeenCalled();
  });

  it('reports no fresh pick when the last attempt was a marked album', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeReply('Nobody', 'Nothing'))
      .mockResolvedValue(claudeReply('Wire', 'Pink Flag'));
    mockFindAlbum.mockResolvedValue({ status: 'not_found' });

    await expect(recommend(rated('Wire – Pink Flag'))).rejects.toBeInstanceOf(NoFreshPickError);
  });

  it('reports an unverified pick when the last attempt was one that could not be found', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeReply('Wire', 'Pink Flag'))
      .mockResolvedValue(claudeReply('Nobody', 'Nothing'));
    mockFindAlbum.mockResolvedValue({ status: 'not_found' });

    await expect(recommend(rated('Wire – Pink Flag'))).rejects.toBeInstanceOf(
      UnverifiedRecommendationError,
    );
  });

  it('still falls back to an album merely seen before, and says so in the log', async () => {
    mockCreate.mockResolvedValue(claudeReply('Massive Attack', 'Mezzanine'));

    const result = await recommend({
      ...validRequest,
      alreadySuggested: ['Massive Attack – Mezzanine'],
      taste: { avoid: ['Wire – Pink Flag'], liked: [], disliked: [] },
    });

    expect(result.album).toBe('Mezzanine');
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ album: 'Mezzanine' }),
      'repeat pick shown',
    );
  });

  it('prefers a repeat of an album merely seen to failing, when marked ones fill the rest', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeReply('Massive Attack', 'Mezzanine'))
      .mockResolvedValue(claudeReply('Wire', 'Pink Flag'));

    const result = await recommend({
      ...validRequest,
      alreadySuggested: ['Massive Attack – Mezzanine'],
      taste: { avoid: ['Wire – Pink Flag'], liked: [], disliked: [] },
    });

    expect(result.album).toBe('Mezzanine');
  });

  it('does not say a repeat was shown when none was', async () => {
    mockCreate.mockResolvedValue(claudeReply('Burial', 'Untrue'));

    await recommend(rated('Wire – Pink Flag'));

    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), 'repeat pick shown');
  });

  it('picks as before when there is no taste', async () => {
    mockCreate.mockResolvedValue(claudeReply('Wire', 'Pink Flag'));

    const result = await recommend(validRequest);

    expect(result.album).toBe('Pink Flag');
  });
});
