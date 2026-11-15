import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

export function parseJsonResponse(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // The model occasionally wraps the JSON in a sentence despite instructions.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not parse JSON from Claude response');
    return JSON.parse(match[0]);
  }
}

export interface JsonCompletionRequest {
  readonly system: string;
  readonly prompt: string;
  readonly maxTokens: number;
  readonly timeoutMs: number;
}

/** Sends a single-turn prompt and returns the parsed JSON body; callers validate its shape. */
export async function completeJson(request: JsonCompletionRequest): Promise<unknown> {
  const message = await getAnthropicClient().messages.create(
    {
      model: MODEL,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: [{ role: 'user', content: request.prompt }],
    },
    { signal: AbortSignal.timeout(request.timeoutMs) },
  );

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in API response');
  }

  return parseJsonResponse(textBlock.text);
}
