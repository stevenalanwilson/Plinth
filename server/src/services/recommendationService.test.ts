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
import { RecommendationRequest } from '../../shared/types';

const mockCreate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
});

const validRequest: RecommendationRequest = {
  artistList: ['Radiohead', 'Portishead'],
  albumList: ['OK Computer', 'Dummy'],
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
    delete process.env.ANTHROPIC_API_KEY;

    await expect(getRecommendation(validRequest)).rejects.toThrow(
      'ANTHROPIC_API_KEY is not configured',
    );
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

    await expect(getRecommendation(validRequest)).rejects.toThrow(
      'Incomplete recommendation data',
    );
  });

  it('includes genre constraint in the prompt when genre is set', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    await getRecommendation({ ...validRequest, genre: 'Jazz' });

    const callArgs = mockCreate.mock.calls[0][0];
    const prompt = callArgs.messages[0].content as string;
    expect(prompt).toContain('Jazz');
    expect(prompt).toContain('Constrain your recommendation specifically to the Jazz genre');
  });

  it('omits genre constraint from the prompt when genre is not set', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    await getRecommendation(validRequest);

    const callArgs = mockCreate.mock.calls[0][0];
    const prompt = callArgs.messages[0].content as string;
    expect(prompt).not.toContain('Constrain your recommendation specifically');
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
});
