import Anthropic from '@anthropic-ai/sdk';
import { RecommendationRequest, RecommendationResponse } from '../../shared/types';

const SYSTEM_PROMPT =
  'You are a music expert with encyclopaedic knowledge of albums across all genres. ' +
  'You make thoughtful, specific, personalised recommendations. ' +
  'Respond only with valid JSON — no markdown, no prose, nothing else.';

function buildPrompt(request: RecommendationRequest): string {
  const artistText = request.artistList.slice(0, 100).join(', ');

  const avoidList = [...new Set([...request.albumList, ...request.alreadySuggested])];
  const avoidStr =
    avoidList.length > 0
      ? `\n\nIMPORTANT — do NOT recommend any of these (already in library or previously suggested): ${avoidList.slice(0, 120).join(', ')}`
      : '';

  const genreStr = request.genre
    ? `\n\nConstrain your recommendation specifically to the ${request.genre} genre.`
    : '';

  return `Based on this person's Apple Music library, recommend ONE album they don't own but would love.

Their library includes artists: ${artistText}

This list was extracted directly from their Apple Music XML library export, so it is comprehensive and accurate.

Their taste spans: atmospheric trip-hop and electronic (Massive Attack, Portishead, Burial, Goldie, Leftfield, Underworld), post-punk and indie (IDLES, Yard Act, Sleaford Mods, shame, The Smiths, Joy Division, Wild Beasts), art rock and leftfield pop (David Bowie, Beck, Radiohead, Björk, Grimes), hip-hop and beats (DJ Shadow, De La Soul, Freddie Gibbs & Madlib, Nujabes, Jurassic 5, Cut Chemist), ambient and neoclassical (Nils Frahm, Max Richter, Brian Eno, Ryuichi Sakamoto), krautrock-influenced electronic (Kraftwerk, Tangerine Dream, Orbital, Aphex Twin), British folk (The Unthanks, Spiro, Treacherous Orchestra, Ye Vagabonds), drum & bass and breakbeat (Noisia, Black Sun Empire, Future Funk Squad).

Pick something genuinely interesting — a deep cut or overlooked gem rather than an obvious classic. It must be a real, released album.${genreStr}${avoidStr}

Respond with ONLY this JSON:
{
  "artist": "Artist Name",
  "album": "Album Title",
  "year": "YYYY",
  "reason": "Two sentences on why this fits their taste, naming 2-3 artists from their library."
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: 'claude-3-5-haiku-20241022',
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
