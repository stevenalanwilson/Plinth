import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { getArtistEssentials, buildPrompt, toArtistEssentials } from './artistEssentialsService';

const mockCreate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
});

const validAlbums = [
  { album: 'Spirit of Eden', year: '1988', reason: 'A transformative work.' },
  { album: 'Laughing Stock', year: '1991', reason: 'The culmination of their art.' },
  { album: "It's My Life", year: '1984', reason: 'Accessible early new wave.' },
  { album: "It's My Life 2", year: '1985', reason: 'Follow-up.' },
  { album: 'The Colour of Spring', year: '1986', reason: 'Key transitional album.' },
];

const validJsonResponse = JSON.stringify({
  artist: 'Talk Talk',
  albums: validAlbums,
});

describe('buildPrompt', () => {
  it('includes the artist name in the output', () => {
    const prompt = buildPrompt('Talk Talk');
    expect(prompt).toContain('Talk Talk');
  });

  it('mentions essential', () => {
    const prompt = buildPrompt('Talk Talk');
    expect(prompt.toLowerCase()).toContain('essential');
  });
});

describe('toArtistEssentials', () => {
  it('maps a valid response', () => {
    const result = toArtistEssentials(JSON.parse(validJsonResponse));
    expect(result.artist).toBe('Talk Talk');
    expect(result.albums).toHaveLength(5);
    expect(result.albums[0].album).toBe('Spirit of Eden');
  });

  it('coerces numeric year to string', () => {
    const json = JSON.stringify({
      artist: 'Talk Talk',
      albums: [{ album: 'Spirit of Eden', year: 1988, reason: 'Great.' }],
    });
    const result = toArtistEssentials(JSON.parse(json));
    expect(result.albums[0].year).toBe('1988');
  });

  it('slices albums to a maximum of 8', () => {
    const manyAlbums = Array.from({ length: 12 }, (_, i) => ({
      album: `Album ${i}`,
      year: '2000',
      reason: 'Reason.',
    }));
    const json = JSON.stringify({ artist: 'Artist', albums: manyAlbums });
    const result = toArtistEssentials(JSON.parse(json));
    expect(result.albums).toHaveLength(8);
  });

  it('throws when artist field is missing', () => {
    const json = JSON.stringify({ albums: validAlbums });
    expect(() => toArtistEssentials(JSON.parse(json))).toThrow();
  });

  it('throws when albums field is missing', () => {
    const json = JSON.stringify({ artist: 'Talk Talk' });
    expect(() => toArtistEssentials(JSON.parse(json))).toThrow();
  });

  it('throws when albums is an empty array', () => {
    const json = JSON.stringify({ artist: 'Talk Talk', albums: [] });
    expect(() => toArtistEssentials(JSON.parse(json))).toThrow();
  });

  it('throws when an album entry is missing required fields', () => {
    const json = JSON.stringify({
      artist: 'Talk Talk',
      albums: [{ album: 'Spirit of Eden' }],
    });
    expect(() => toArtistEssentials(JSON.parse(json))).toThrow();
  });
});

describe('getArtistEssentials', () => {
  it('returns a parsed response on success', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: validJsonResponse }],
    });

    const result = await getArtistEssentials({ artist: 'Talk Talk' });

    expect(result.artist).toBe('Talk Talk');
    expect(result.albums.length).toBeGreaterThan(0);
  });

  it('throws when there is no text content in the API response', async () => {
    mockCreate.mockResolvedValue({ content: [] });

    await expect(getArtistEssentials({ artist: 'Talk Talk' })).rejects.toThrow();
  });

  it('throws when the API call fails', async () => {
    mockCreate.mockRejectedValue(new Error('Network error'));

    await expect(getArtistEssentials({ artist: 'Talk Talk' })).rejects.toThrow('Network error');
  });
});
