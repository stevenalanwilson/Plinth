import Anthropic from '@anthropic-ai/sdk';
import {
  RecommendationRequest,
  RecommendationResponse,
  RecommendationPreferences,
} from '@shared/types';

const SYSTEM_PROMPT =
  'You are a music expert with encyclopaedic knowledge of albums across all genres. ' +
  'You make thoughtful, specific, personalised recommendations. ' +
  'Only recommend albums you have complete certainty exist as real, released recordings. ' +
  'Never invent or fabricate an artist or album title — if you are not certain an album exists, choose a different one you are sure about. ' +
  'Respond only with valid JSON — no markdown, no prose, nothing else.';

// Lazily initialised so the key is read at request time, not import time,
// which means a missing key throws a clear error rather than crashing on startup.
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

function thresholdLabel(value: number, low: string, mid: string, high: string): string {
  if (value <= 3) return low;
  if (value <= 7) return mid;
  return high;
}

function buildPreferencesSummary(preferences: RecommendationPreferences): string {
  const parts: string[] = [];

  if (preferences.genres.length > 0) {
    parts.push(`genres: ${preferences.genres.join(', ')}`);
  }

  if (preferences.moods.length > 0) {
    parts.push(`mood: ${preferences.moods.join(', ')}`);
  }

  parts.push(`tempo: ${thresholdLabel(preferences.tempo, 'slow', 'moderate', 'fast')}`);
  parts.push(`energy: ${thresholdLabel(preferences.energy, 'mellow', 'moderate', 'intense')}`);
  parts.push(`density: ${thresholdLabel(preferences.density, 'sparse', 'moderate', 'dense')}`);

  const eraLabel = preferences.era === 'any' ? 'any era' : `the ${preferences.era} era`;
  parts.push(`era: ${eraLabel}`);

  if (preferences.prioritiseObscure) {
    parts.push('strongly prefer lesser-known and underground artists over obvious choices');
  } else if (!preferences.includeFamiliarArtists) {
    parts.push('prefer less familiar artists');
  } else {
    parts.push('familiar and well-known artists are fine');
  }

  if (preferences.stayFocused) {
    parts.push('stay close to these stated preferences — do not stray into unrelated territory');
  }

  return parts.join('; ');
}

export function buildPrompt(request: RecommendationRequest): string {
  const summary = buildPreferencesSummary(request.preferences);

  const avoidStr =
    request.alreadySuggested.length > 0
      ? `\n\nIMPORTANT — do NOT recommend any of these previously suggested albums (format is "Artist – Album"): ${request.alreadySuggested
          .map((s) => s.replace(/[\r\n]/g, ' '))
          .slice(0, 120)
          .join(', ')}`
      : '';

  let pivotStr = '';
  if (request.pivot) {
    const ref = `"${request.pivot.artist} – ${request.pivot.album}"`;
    if (request.pivot.type === 'more-like-this') {
      pivotStr = `\n\nThe user enjoyed ${ref} and wants their next recommendation to be in a similar vein — comparable energy, style, mood, and era. Suggest something from a related scene or sound, but not the same artist.`;
    } else {
      pivotStr = `\n\nThe user was not satisfied with ${ref}. Recommend something meaningfully different — deliberately avoid similar genres, sounds, era, and mood.`;
    }
  }

  let seedStr = '';
  if (request.seedArtist) {
    seedStr = `\n\nThe user has discovered ${request.seedArtist} through an artist connection. Recommend a specific album by ${request.seedArtist} that fits their preferences. Do not suggest a different artist — the user specifically wants to explore ${request.seedArtist}'s catalogue.`;
  }

  let vibeStr = '';
  if (request.vibeQuery) {
    vibeStr = `\n\nThe user has described their vibe in their own words: "${request.vibeQuery}"\nTreat this as your primary creative brief — interpret it imaginatively. If it references a mashup of artists, styles, or moods, find a real album that captures that spirit.`;
  }

  return `Recommend ONE album for someone with the following preferences: ${summary}.${vibeStr}

Pick something genuinely interesting — a deep cut or overlooked gem rather than an obvious classic. It must be a real, released album.${avoidStr}${pivotStr}${seedStr}

Respond with ONLY this JSON:
{
  "artist": "Artist Name",
  "album": "Album Title",
  "year": "YYYY",
  "reason": "Two sentences on why this fits their preferences.",
  "genres": ["Primary Genre", "Secondary Genre"],
  "country": "Country of Origin"
}`;
}

function parseRecommendationJson(raw: string): RecommendationResponse {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not parse recommendation JSON');
    parsed = JSON.parse(match[0]);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('artist' in parsed) ||
    !('album' in parsed) ||
    !('year' in parsed) ||
    !('reason' in parsed)
  ) {
    throw new Error('Incomplete recommendation data');
  }

  const rec = parsed as Record<string, unknown>;

  // Coerce numeric year to string — LLMs occasionally omit the quotes around a year value.
  if (typeof rec.year === 'number') {
    rec.year = String(rec.year);
  }

  if (
    typeof rec.artist !== 'string' ||
    typeof rec.album !== 'string' ||
    typeof rec.year !== 'string' ||
    typeof rec.reason !== 'string'
  ) {
    throw new Error('Invalid recommendation field types');
  }

  const genres = Array.isArray(rec.genres)
    ? (rec.genres as unknown[]).filter((g): g is string => typeof g === 'string')
    : undefined;
  const country = typeof rec.country === 'string' ? rec.country : undefined;

  return {
    artist: rec.artist,
    album: rec.album,
    year: rec.year,
    reason: rec.reason,
    ...(genres !== undefined && genres.length > 0 ? { genres } : {}),
    ...(country !== undefined ? { country } : {}),
  };
}

function isDuplicate(rec: RecommendationResponse, alreadySuggested: readonly string[]): boolean {
  const key = `${rec.artist} – ${rec.album}`.toLowerCase();
  return alreadySuggested.some((s) => s.toLowerCase() === key);
}

async function callClaude(client: Anthropic, prompt: string): Promise<RecommendationResponse> {
  const message = await client.messages.create(
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    },
    { signal: AbortSignal.timeout(15_000) },
  );

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in API response');
  }

  return parseRecommendationJson(textBlock.text);
}

const MAX_ATTEMPTS = 3;

export async function getRecommendation(
  request: RecommendationRequest,
): Promise<RecommendationResponse> {
  const client = getAnthropicClient();

  // Accumulate duplicates returned across attempts so each retry prompt is stricter.
  const seen = [...request.alreadySuggested];
  let lastRec: RecommendationResponse | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const prompt = buildPrompt({ ...request, alreadySuggested: seen });
    lastRec = await callClaude(client, prompt);

    if (!isDuplicate(lastRec, request.alreadySuggested)) {
      return lastRec;
    }

    // Add the duplicate to seen so the next attempt explicitly avoids it too.
    seen.push(`${lastRec.artist} – ${lastRec.album}`);
  }

  // All attempts returned duplicates — return the last result rather than making another call.
  return lastRec!;
}
