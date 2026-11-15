import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(),
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import Anthropic from '@anthropic-ai/sdk';
import { completeJson } from './claudeClient';
import { logger } from '../logger';

const mockCreate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
});

const schema = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
  additionalProperties: false,
};

const request = {
  label: 'test-route',
  system: 'Be helpful.',
  prompt: 'Give me JSON.',
  schema,
  maxTokens: 500,
  timeoutMs: 5000,
};

function apiResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model: 'claude-sonnet-4-6',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: '{"ok":true}' }],
    usage: {
      input_tokens: 120,
      output_tokens: 30,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    ...overrides,
  };
}

describe('completeJson', () => {
  it('constrains the response to the given JSON schema', async () => {
    mockCreate.mockResolvedValue(apiResponse());

    await completeJson(request);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 500,
        system: 'Be helpful.',
        messages: [{ role: 'user', content: 'Give me JSON.' }],
        output_config: { format: { type: 'json_schema', schema } },
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('returns the parsed JSON body', async () => {
    mockCreate.mockResolvedValue(apiResponse());

    await expect(completeJson(request)).resolves.toEqual({ ok: true });
  });

  it('logs token usage for every call', async () => {
    mockCreate.mockResolvedValue(apiResponse());

    await completeJson(request);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'test-route',
        model: 'claude-sonnet-4-6',
        stopReason: 'end_turn',
        inputTokens: 120,
        outputTokens: 30,
        durationMs: expect.any(Number),
      }),
      'claude usage',
    );
  });

  it('still logs usage when the response is unusable', async () => {
    mockCreate.mockResolvedValue(apiResponse({ stop_reason: 'max_tokens' }));

    await expect(completeJson(request)).rejects.toThrow();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ stopReason: 'max_tokens' }),
      'claude usage',
    );
  });

  it('throws when the response was cut off at max_tokens', async () => {
    mockCreate.mockResolvedValue(apiResponse({ stop_reason: 'max_tokens' }));

    await expect(completeJson(request)).rejects.toThrow('cut off at max_tokens');
  });

  it('throws when Claude declines the request', async () => {
    mockCreate.mockResolvedValue(apiResponse({ stop_reason: 'refusal', content: [] }));

    await expect(completeJson(request)).rejects.toThrow('Claude declined the request');
  });

  it('throws when the response has no text block', async () => {
    mockCreate.mockResolvedValue(apiResponse({ content: [] }));

    await expect(completeJson(request)).rejects.toThrow('No text content in API response');
  });

  it('throws a clear error when the text is not JSON', async () => {
    mockCreate.mockResolvedValue(apiResponse({ content: [{ type: 'text', text: 'not json' }] }));

    await expect(completeJson(request)).rejects.toThrow('Claude response was not valid JSON');
  });

  it('propagates API errors', async () => {
    mockCreate.mockRejectedValue(new Error('Overloaded'));

    await expect(completeJson(request)).rejects.toThrow('Overloaded');
  });
});
