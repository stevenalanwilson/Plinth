import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(),
}));

import Anthropic from '@anthropic-ai/sdk';
import { completeJson, parseJsonResponse } from './claudeClient';

const mockCreate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
});

const request = { system: 'Be helpful.', prompt: 'Give me JSON.', maxTokens: 500, timeoutMs: 5000 };

describe('parseJsonResponse', () => {
  it('parses plain JSON', () => {
    expect(parseJsonResponse('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips a markdown code fence', () => {
    expect(parseJsonResponse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('extracts JSON wrapped in surrounding prose', () => {
    expect(parseJsonResponse('Here you go: {"a":1} Enjoy!')).toEqual({ a: 1 });
  });

  it('throws when there is no JSON object', () => {
    expect(() => parseJsonResponse('no json here')).toThrow(
      'Could not parse JSON from Claude response',
    );
  });
});

describe('completeJson', () => {
  it('sends the prompt and returns the parsed text block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"ok":true}' }] });

    await expect(completeJson(request)).resolves.toEqual({ ok: true });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 500,
        system: 'Be helpful.',
        messages: [{ role: 'user', content: 'Give me JSON.' }],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('throws when the response has no text block', async () => {
    mockCreate.mockResolvedValue({ content: [] });

    await expect(completeJson(request)).rejects.toThrow('No text content in API response');
  });

  it('propagates API errors', async () => {
    mockCreate.mockRejectedValue(new Error('Overloaded'));

    await expect(completeJson(request)).rejects.toThrow('Overloaded');
  });
});
