import { describe, it, expect } from 'vitest';
import { signInChannel } from './signInChannel';

const PRODUCTION = {
  NODE_ENV: 'production',
  RESEND_API_KEY: 're_key',
  EMAIL_FROM: 'login@plinth.rocks',
  PUBLIC_URL: 'https://www.plinth.rocks',
};

describe('signInChannel in production', () => {
  it('is on when the email service and the public address are all set', () => {
    const { channel, missing } = signInChannel(PRODUCTION);

    expect(channel?.baseUrl).toBe('https://www.plinth.rocks');
    expect(missing).toEqual([]);
  });

  it.each(['RESEND_API_KEY', 'EMAIL_FROM', 'PUBLIC_URL'])(
    'is off, and names %s, when it is missing',
    (name) => {
      const { channel, missing } = signInChannel({ ...PRODUCTION, [name]: undefined });

      expect(channel).toBeNull();
      expect(missing).toEqual([name]);
    },
  );

  it('names everything that is missing', () => {
    const { channel, missing } = signInChannel({ NODE_ENV: 'production' });

    expect(channel).toBeNull();
    expect(missing).toEqual(['RESEND_API_KEY', 'EMAIL_FROM', 'PUBLIC_URL']);
  });

  it('treats a blank value as missing', () => {
    expect(signInChannel({ ...PRODUCTION, EMAIL_FROM: '   ' }).missing).toEqual(['EMAIL_FROM']);
  });

  it('never falls back to writing links to the log', async () => {
    const { channel } = signInChannel({ NODE_ENV: 'production', PUBLIC_URL: 'https://x.example' });

    expect(channel).toBeNull();
  });
});

describe('signInChannel outside production', () => {
  it('is on without an email service, and starts links from the client’s address', () => {
    const { channel } = signInChannel({ CORS_ORIGIN: 'http://localhost:5180' });

    expect(channel?.baseUrl).toBe('http://localhost:5180');
  });

  it('prefers the public address when there is one', () => {
    const { channel } = signInChannel({
      PUBLIC_URL: 'https://staging.example',
      CORS_ORIGIN: 'http://localhost:5180',
    });

    expect(channel?.baseUrl).toBe('https://staging.example');
  });

  it('falls back to the usual development address', () => {
    expect(signInChannel({}).channel?.baseUrl).toBe('http://localhost:5173');
  });

  it('is on, with a real sender, when the email service is set', () => {
    const { channel, missing } = signInChannel({
      RESEND_API_KEY: 're_key',
      EMAIL_FROM: 'login@plinth.rocks',
    });

    expect(channel).not.toBeNull();
    expect(missing).toEqual([]);
  });
});
