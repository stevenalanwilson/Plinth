import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../services/imageProxyService', () => ({
  fetchImageBytes: vi.fn(),
}));

import { handleImage } from './imageController';
import { fetchImageBytes } from '../services/imageProxyService';

const mockFetchImageBytes = vi.mocked(fetchImageBytes);

function makeRes(): {
  res: Response;
  headers: Record<string, string>;
  send: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const headers: Record<string, string> = {};
  const send = vi.fn();
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    },
    send,
    status,
  } as unknown as Response;
  return { res, headers, send, status, json };
}

function makeReq(query: Record<string, unknown>): Request {
  return { query } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleImage', () => {
  it('serves the image with a policy that lets the client embed it from another origin', async () => {
    const buffer = Buffer.from('img');
    mockFetchImageBytes.mockResolvedValue({ buffer, contentType: 'image/jpeg' });
    const { res, headers, send } = makeRes();

    await handleImage(makeReq({ url: 'https://coverartarchive.org/x.jpg' }), res);

    expect(send).toHaveBeenCalledWith(buffer);
    expect(headers['content-type']).toBe('image/jpeg');
    expect(headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('returns 400 when url is missing', async () => {
    const { res, status } = makeRes();

    await handleImage(makeReq({}), res);

    expect(status).toHaveBeenCalledWith(400);
    expect(mockFetchImageBytes).not.toHaveBeenCalled();
  });

  it('returns 502 when the image cannot be fetched', async () => {
    mockFetchImageBytes.mockRejectedValue(new Error('Untrusted image hostname: example.com'));
    const { res, status, json } = makeRes();

    await handleImage(makeReq({ url: 'https://example.com/x.jpg' }), res);

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith({ error: 'Untrusted image hostname: example.com' });
  });
});
