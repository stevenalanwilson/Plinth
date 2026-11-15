import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchImageBytes } from './imageProxyService';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function makeBodyStream(data: Buffer): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new ReadableStream({
    start(controller): void {
      controller.enqueue(new Uint8Array(data.buffer as ArrayBuffer));
      controller.close();
    },
  });
}

function makeResponse(
  contentType: string,
  body: Buffer | null = null,
  status = 200,
): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) => (key === 'content-type' ? contentType : null),
    } as unknown as Headers,
    body: body ? makeBodyStream(body) : null,
  };
}

function makeRedirect(location: string, status = 307): Partial<Response> {
  return {
    ok: false,
    status,
    headers: {
      get: (key: string) => (key === 'location' ? location : null),
    } as unknown as Headers,
    body: null,
  };
}

describe('fetchImageBytes redirects', () => {
  it('handles redirects itself so each hop can be checked', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse('image/jpeg', Buffer.from('img')));

    await fetchImageBytes('https://coverartarchive.org/release-group/abc/front');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://coverartarchive.org/release-group/abc/front',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('follows a redirect from Cover Art Archive to archive.org', async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeRedirect('https://ia800501.us.archive.org/download/mbid/front.jpg'),
      )
      .mockResolvedValueOnce(makeResponse('image/jpeg', Buffer.from('img')));

    const result = await fetchImageBytes('https://coverartarchive.org/release-group/abc/front');

    expect(result.contentType).toBe('image/jpeg');
    expect(mockFetch).toHaveBeenLastCalledWith(
      'https://ia800501.us.archive.org/download/mbid/front.jpg',
      expect.anything(),
    );
  });

  it('resolves relative redirect locations against the current URL', async () => {
    mockFetch
      .mockResolvedValueOnce(makeRedirect('/download/mbid/front.jpg'))
      .mockResolvedValueOnce(makeResponse('image/jpeg', Buffer.from('img')));

    await fetchImageBytes('https://archive.org/release-group/abc/front');

    expect(mockFetch).toHaveBeenLastCalledWith(
      'https://archive.org/download/mbid/front.jpg',
      expect.anything(),
    );
  });

  it('refuses to follow a redirect to an untrusted host', async () => {
    mockFetch.mockResolvedValueOnce(makeRedirect('http://169.254.169.254/latest/meta-data'));

    await expect(
      fetchImageBytes('https://coverartarchive.org/release-group/abc/front'),
    ).rejects.toThrow('Untrusted image hostname');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('gives up after too many redirects', async () => {
    mockFetch.mockResolvedValue(makeRedirect('https://archive.org/loop'));

    await expect(fetchImageBytes('https://archive.org/loop')).rejects.toThrow('Too many redirects');
  });

  it('rejects a redirect with no location', async () => {
    mockFetch.mockResolvedValueOnce(makeRedirect(''));

    await expect(fetchImageBytes('https://archive.org/download/mbid/img.jpg')).rejects.toThrow(
      'Redirect without a location',
    );
  });
});

describe('fetchImageBytes', () => {
  it('rejects SVG images, which can carry scripts', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse('image/svg+xml', Buffer.from('<svg/>')));

    await expect(fetchImageBytes('https://archive.org/download/mbid/img.svg')).rejects.toThrow(
      'Unexpected content-type',
    );
  });

  it('accepts a content-type with parameters', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse('image/webp; charset=binary', Buffer.from('img')));

    const result = await fetchImageBytes('https://archive.org/download/mbid/img.webp');

    expect(result.contentType).toBe('image/webp; charset=binary');
  });

  it('rejects non-http protocols', async () => {
    await expect(fetchImageBytes('ftp://archive.org/img.jpg')).rejects.toThrow(
      'Unsupported image URL protocol',
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches an image from coverartarchive.org', async () => {
    const fakeBuffer = Buffer.from('fake-image-data');
    mockFetch.mockResolvedValueOnce(makeResponse('image/jpeg', fakeBuffer));

    const result = await fetchImageBytes('https://coverartarchive.org/release-group/abc/front');

    expect(result.contentType).toBe('image/jpeg');
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('fetches an image from a subdomain of archive.org', async () => {
    const fakeBuffer = Buffer.from('fake-image-data');
    mockFetch.mockResolvedValueOnce(makeResponse('image/png', fakeBuffer));

    const result = await fetchImageBytes(
      'https://ia800501.us.archive.org/download/mbid-abc/thumb.jpg',
    );

    expect(result.contentType).toBe('image/png');
  });

  it('rejects URLs from untrusted domains', async () => {
    await expect(fetchImageBytes('https://evil.com/image.jpg')).rejects.toThrow(
      'Untrusted image hostname',
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws on invalid URLs', async () => {
    await expect(fetchImageBytes('not-a-url')).rejects.toThrow('Invalid URL');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when the image fetch returns a non-ok status', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

    await expect(
      fetchImageBytes('https://coverartarchive.org/release-group/abc/front'),
    ).rejects.toThrow('Image fetch failed with status 503');
  });

  it('throws when the response content-type is not an image', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse('text/html'));

    await expect(fetchImageBytes('https://archive.org/download/mbid/img.jpg')).rejects.toThrow(
      'Unexpected content-type',
    );
  });
});
