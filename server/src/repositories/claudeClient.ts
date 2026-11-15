import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger';

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

function logUsage(label: string, message: Anthropic.Message, durationMs: number): void {
  // One line per call so spend can be tracked per route from the logs.
  logger.info(
    {
      label,
      model: message.model,
      stopReason: message.stop_reason,
      inputTokens: message.usage?.input_tokens,
      outputTokens: message.usage?.output_tokens,
      cacheReadInputTokens: message.usage?.cache_read_input_tokens,
      cacheCreationInputTokens: message.usage?.cache_creation_input_tokens,
      durationMs,
    },
    'claude usage',
  );
}

export interface JsonCompletionRequest {
  /** Names the route in usage logs, e.g. "recommendation". */
  readonly label: string;
  readonly system: string;
  readonly prompt: string;
  /** JSON schema the response must match (structured outputs). */
  readonly schema: Readonly<Record<string, unknown>>;
  readonly maxTokens: number;
  readonly timeoutMs: number;
}

/**
 * Sends a single-turn prompt with structured outputs, so the reply is JSON matching
 * `schema`. Returns it parsed; callers still check the values make sense.
 */
export async function completeJson(request: JsonCompletionRequest): Promise<unknown> {
  const startedAt = Date.now();
  const message = await getAnthropicClient().messages.create(
    {
      model: MODEL,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: [{ role: 'user', content: request.prompt }],
      output_config: { format: { type: 'json_schema', schema: { ...request.schema } } },
    },
    { signal: AbortSignal.timeout(request.timeoutMs) },
  );
  logUsage(request.label, message, Date.now() - startedAt);

  if (message.stop_reason === 'refusal') {
    throw new Error('Claude declined the request');
  }
  // A truncated reply is cut off mid-JSON, so the schema guarantee no longer holds.
  if (message.stop_reason === 'max_tokens') {
    throw new Error('Claude response was cut off at max_tokens');
  }

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in API response');
  }

  try {
    return JSON.parse(textBlock.text);
  } catch {
    throw new Error('Claude response was not valid JSON');
  }
}
