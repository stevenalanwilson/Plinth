import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequestSpacer, escapeLucene, musicBrainzFetch } from './musicBrainzClient';

describe('createRequestSpacer', () => {
  it('spaces back-to-back requests by the interval', () => {
    const reserve = createRequestSpacer(1000, () => 10_000);

    expect([reserve(), reserve(), reserve()]).toEqual([0, 1000, 2000]);
  });

  it('adds no delay once the interval has passed', () => {
    let now = 10_000;
    const reserve = createRequestSpacer(1000, () => now);

    reserve();
    now += 1500;

    expect(reserve()).toBe(0);
  });

  it('only waits for the remainder of the interval', () => {
    let now = 10_000;
    const reserve = createRequestSpacer(1000, () => now);

    reserve();
    now += 400;

    expect(reserve()).toBe(600);
  });
});

describe('escapeLucene', () => {
  it('escapes Lucene special characters, including forward slash', () => {
    expect(escapeLucene('AC/DC: Back (In) Black!')).toBe('AC\\/DC\\: Back \\(In\\) Black\\!');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLucene('Massive Attack')).toBe('Massive Attack');
  });
});

describe('musicBrainzFetch', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.MUSICBRAINZ_CONTACT;
  });

  it('never sends two requests less than a second apart', async () => {
    const budget = new AbortController().signal;
    const sentAt: number[] = [];
    mockFetch.mockImplementation(() => {
      sentAt.push(Date.now());
      return Promise.resolve({ ok: true });
    });

    const requests = [
      musicBrainzFetch('artist?query=a', budget),
      musicBrainzFetch('artist?query=b', budget),
      musicBrainzFetch('artist?query=c', budget),
    ];
    await vi.runAllTimersAsync();
    await Promise.all(requests);

    expect(sentAt).toHaveLength(3);
    expect(sentAt[1] - sentAt[0]).toBeGreaterThanOrEqual(1000);
    expect(sentAt[2] - sentAt[1]).toBeGreaterThanOrEqual(1000);
  });

  it('gives up waiting for a slot when the budget is spent', async () => {
    const budget = new AbortController();
    const first = musicBrainzFetch('artist?query=first', budget.signal).catch(() => undefined);
    const queued = musicBrainzFetch('artist?query=second', budget.signal);
    const assertion = expect(queued).rejects.toBeDefined();

    budget.abort();
    await assertion;
    await first;
  });

  function makeStatus(status: number, retryAfter: string | null = null): Partial<Response> {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (key: string) => (key === 'retry-after' ? retryAfter : null),
      } as unknown as Headers,
    };
  }

  it('retries when MusicBrainz is busy (503)', async () => {
    mockFetch.mockResolvedValueOnce(makeStatus(503)).mockResolvedValueOnce(makeStatus(200));

    const request = musicBrainzFetch('artist?query=a', new AbortController().signal);
    await vi.runAllTimersAsync();
    const res = await request;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('honours Retry-After before retrying', async () => {
    const sentAt: number[] = [];
    mockFetch.mockImplementation(() => {
      sentAt.push(Date.now());
      return Promise.resolve(sentAt.length === 1 ? makeStatus(503, '3') : makeStatus(200));
    });

    const request = musicBrainzFetch('artist?query=a', new AbortController().signal);
    await vi.runAllTimersAsync();
    await request;

    expect(sentAt[1] - sentAt[0]).toBeGreaterThanOrEqual(3000);
  });

  it('returns the last 503 after running out of attempts', async () => {
    mockFetch.mockResolvedValue(makeStatus(503));

    const request = musicBrainzFetch('artist?query=a', new AbortController().signal);
    await vi.runAllTimersAsync();
    const res = await request;

    expect(res.status).toBe(503);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('does not retry other errors', async () => {
    mockFetch.mockResolvedValue(makeStatus(404));

    const request = musicBrainzFetch('artist?query=a', new AbortController().signal);
    await vi.runAllTimersAsync();
    const res = await request;

    expect(res.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('identifies the app with the configured contact', async () => {
    process.env.MUSICBRAINZ_CONTACT = 'me@example.org';

    const request = musicBrainzFetch('artist?query=a', new AbortController().signal);
    await vi.runAllTimersAsync();
    await request;

    expect(mockFetch).toHaveBeenCalledWith(
      'https://musicbrainz.org/ws/2/artist?query=a',
      expect.objectContaining({
        headers: { 'User-Agent': 'AlbumRecommender/1.0 ( me@example.org )' },
      }),
    );
  });
});
