import { describe, it, expect, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createLoggingEmailSender, createResendEmailSender } from './emailSender';
import { logger } from '../logger';

const MESSAGE = { to: 'a@example.com', subject: 'Hello', text: 'Body' };

describe('createResendEmailSender', () => {
  function senderWith(fetchImpl: typeof fetch): ReturnType<typeof createResendEmailSender> {
    return createResendEmailSender({
      apiKey: 're_secret',
      from: 'Plinth <login@plinth.rocks>',
      fetchImpl,
    });
  }

  it('posts the email to Resend with the key and the sender', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    await senderWith(fetchImpl).send(MESSAGE);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_secret');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Plinth <login@plinth.rocks>',
      to: ['a@example.com'],
      subject: 'Hello',
      text: 'Body',
    });
  });

  it('gives up on a request that takes too long', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    await senderWith(fetchImpl).send(MESSAGE);

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects when Resend refuses, with the status and nothing from the body', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response('{"message":"a@example.com is not allowed"}', { status: 422 }),
      );

    const result = senderWith(fetchImpl).send(MESSAGE);

    await expect(result).rejects.toThrow('Resend refused the email (status 422)');
    await expect(result).rejects.not.toThrow(/example\.com/);
  });

  it('rejects when Resend cannot be reached', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(senderWith(fetchImpl).send(MESSAGE)).rejects.toThrow('fetch failed');
  });
});

describe('createLoggingEmailSender', () => {
  it('writes the email to the log instead of sending it', async () => {
    await createLoggingEmailSender().send(MESSAGE);

    expect(logger.info).toHaveBeenCalledWith(
      { to: 'a@example.com', subject: 'Hello', text: 'Body' },
      'email not sent (no email service configured)',
    );
  });
});
