import { ArtistEssentialsRequest, ArtistEssentialsResponse, EssentialAlbum } from '@shared/types';
import { completeJson } from '../repositories/claudeClient';

const SYSTEM_PROMPT =
  'You are a music expert with encyclopaedic knowledge of albums across all genres. ' +
  'Only list albums you have complete certainty exist as real, released recordings. ' +
  'Never invent or fabricate an artist or album title — if you are not certain an album exists, choose a different one you are sure about. ' +
  'Respond only with valid JSON — no markdown, no prose, nothing else.';

export function buildPrompt(artist: string): string {
  return `List 5 to 8 essential albums by ${artist} that a new listener should explore. Order them in the way you'd recommend a newcomer to listen through the catalogue — whether that means chronologically, by accessibility, or by importance.

Each album must be a real, verifiably released studio or live album by ${artist}. Do not invent titles.

Respond with ONLY this JSON:
{
  "artist": "Canonical Artist Name",
  "albums": [
    { "album": "Album Title", "year": "YYYY", "reason": "One or two sentences on why this album is essential." }
  ]
}`;
}

export function toArtistEssentials(parsed: unknown): ArtistEssentialsResponse {
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('artist' in parsed) ||
    !('albums' in parsed)
  ) {
    throw new Error('Incomplete essentials data');
  }

  const data = parsed as Record<string, unknown>;

  if (typeof data.artist !== 'string' || data.artist.trim() === '') {
    throw new Error('Invalid artist field in essentials response');
  }

  if (!Array.isArray(data.albums) || data.albums.length === 0) {
    throw new Error('albums must be a non-empty array');
  }

  const albums: EssentialAlbum[] = (data.albums as unknown[])
    .slice(0, 8)
    .map((item: unknown, index: number) => {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`Album at index ${index} is not an object`);
      }
      const entry = item as Record<string, unknown>;

      // Coerce numeric year to string — LLMs occasionally omit the quotes around a year value.
      if (typeof entry.year === 'number') {
        entry.year = String(entry.year);
      }

      if (
        typeof entry.album !== 'string' ||
        typeof entry.year !== 'string' ||
        typeof entry.reason !== 'string'
      ) {
        throw new Error(`Album at index ${index} has invalid field types`);
      }

      return { album: entry.album, year: entry.year, reason: entry.reason };
    });

  return { artist: data.artist, albums };
}

// Structured outputs support only a subset of JSON Schema, so the 5-8 album bound stays
// out of the schema: the prompt asks for it and toArtistEssentials enforces it.
const ESSENTIALS_SCHEMA = {
  type: 'object',
  properties: {
    artist: { type: 'string' },
    albums: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          album: { type: 'string' },
          year: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['album', 'year', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['artist', 'albums'],
  additionalProperties: false,
} as const;

export async function getArtistEssentials(
  request: ArtistEssentialsRequest,
): Promise<ArtistEssentialsResponse> {
  const parsed = await completeJson({
    label: 'artist-essentials',
    schema: ESSENTIALS_SCHEMA,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(request.artist),
    maxTokens: 2000,
    timeoutMs: 20_000,
  });
  return toArtistEssentials(parsed);
}
