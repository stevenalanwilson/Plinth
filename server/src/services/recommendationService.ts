import Anthropic from '@anthropic-ai/sdk';
import {
  RecommendationRequest,
  RecommendationResponse,
  RecommendationPreferences,
} from '@shared/types';

const SYSTEM_PROMPT =
  'You are a music expert with encyclopaedic knowledge of albums across all genres. ' +
  'You make thoughtful, specific, personalised recommendations. ' +
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

function tempoLabel(tempo: number): string {
  if (tempo <= 3) return 'slow';
  if (tempo <= 7) return 'moderate';
  return 'fast';
}

function energyLabel(energy: number): string {
  if (energy <= 3) return 'mellow';
  if (energy <= 7) return 'moderate';
  return 'intense';
}

function densityLabel(density: number): string {
  if (density <= 3) return 'sparse';
  if (density <= 7) return 'moderate';
  return 'dense';
}

function buildPreferencesSummary(preferences: RecommendationPreferences): string {
  const parts: string[] = [];

  if (preferences.genres.length > 0) {
    parts.push(`genres: ${preferences.genres.join(', ')}`);
  }

  if (preferences.moods.length > 0) {
    parts.push(`mood: ${preferences.moods.join(', ')}`);
  }

  parts.push(`tempo: ${tempoLabel(preferences.tempo)}`);
  parts.push(`energy: ${energyLabel(preferences.energy)}`);
  parts.push(`density: ${densityLabel(preferences.density)}`);

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

function buildPrompt(request: RecommendationRequest): string {
  const summary = buildPreferencesSummary(request.preferences);

  const avoidStr =
    request.alreadySuggested.length > 0
      ? `\n\nIMPORTANT — do NOT recommend any of these (previously suggested): ${request.alreadySuggested.slice(0, 120).join(', ')}`
      : '';

  return `Recommend ONE album for someone with the following preferences: ${summary}.

Pick something genuinely interesting — a deep cut or overlooked gem rather than an obvious classic. It must be a real, released album.${avoidStr}

Respond with ONLY this JSON:
{
  "artist": "Artist Name",
  "album": "Album Title",
  "year": "YYYY",
  "reason": "Two sentences on why this fits their preferences."
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

  if (
    typeof rec.artist !== 'string' ||
    typeof rec.album !== 'string' ||
    typeof rec.year !== 'string' ||
    typeof rec.reason !== 'string'
  ) {
    throw new Error('Invalid recommendation field types');
  }

  return {
    artist: rec.artist,
    album: rec.album,
    year: rec.year,
    reason: rec.reason,
  };
}

export async function getRecommendation(
  request: RecommendationRequest,
): Promise<RecommendationResponse> {
  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(request) }],
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in API response');
  }

  return parseRecommendationJson(textBlock.text);
}
