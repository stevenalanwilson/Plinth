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

import Anthropic from '@anthropic-ai/sdk';
import { getRecommendation } from './recommendationService';
import { RecommendationRequest, RecommendationPreferences } from '@shared/types';

const mockCreate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
});

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
});

describe('getRecommendation', () => {
  it('returns a parsed recommendation on success', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    const result = await getRecommendation(validRequest);

    expect(result).toEqual({
      artist: 'Massive Attack',
      album: 'Mezzanine',
      year: '1998',
      reason: 'A perfect fit for your taste.',
    });
  });

  it('strips markdown code fences from response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '```json\n' + validJsonResponse + '\n```' }],
    });

    const result = await getRecommendation(validRequest);
    expect(result.album).toBe('Mezzanine');
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
      'Could not parse recommendation JSON',
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
