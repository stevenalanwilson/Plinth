import { describe, it, expect, afterEach } from 'vitest';
import { Request } from 'express';
import { publicUrl } from './publicUrl';

function request(headers: Record<string, string>, protocol = 'http'): Request {
  return {
    protocol,
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

afterEach(() => {
  delete process.env.PUBLIC_URL;
});

describe('publicUrl', () => {
  it('uses PUBLIC_URL when it is set, without a trailing slash', () => {
    process.env.PUBLIC_URL = ' https://plinth.example/ ';

    expect(publicUrl(request({ host: 'evil.example' }))).toBe('https://plinth.example');
  });

  it('falls back to the address the request arrived on', () => {
    expect(publicUrl(request({ host: 'localhost:3001' }))).toBe('http://localhost:3001');
  });

  it('takes only "https" from a proxy’s header, and nothing else a caller could send', () => {
    expect(publicUrl(request({ host: 'plinth.example', 'x-forwarded-proto': 'https' }))).toBe(
      'https://plinth.example',
    );
    expect(publicUrl(request({ host: 'plinth.example', 'x-forwarded-proto': 'javascript' }))).toBe(
      'http://plinth.example',
    );
  });
});
