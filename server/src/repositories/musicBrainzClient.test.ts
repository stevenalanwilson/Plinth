import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRequestSpacer,
  escapeLucene,
  musicBrainzFetch,
  musicBrainzTtlSeconds,
} from './musicBrainzClient';
import { createInMemoryCacheStore } from './inMemoryCacheStore';
import { configureLookupCache } from './lookupCache';

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

const DAY_SECONDS = 24 * 60 * 60;
const ARTIST_ID = '3b4e2fb8-7a6f-3c1b-9a33-1f0c7d3f6a01';

describe('musicBrainzTtlSeconds', () => {
  const results = { 'release-groups': [{ id: 'rg-1' }] };

  it('keeps a lookup by ID for 30 days, since a record rarely changes', () => {
    expect(musicBrainzTtlSeconds(`artist/${ARTIST_ID}?inc=artist-rels&fmt=json`, {})).toBe(
      30 * DAY_SECONDS,
    );
  });

  it('keeps a lookup by ID for 30 days even when its lists are empty', () => {
    expect(
      musicBrainzTtlSeconds(`artist/${ARTIST_ID}?inc=artist-rels&fmt=json`, { relations: [] }),
    ).toBe(30 * DAY_SECONDS);
  });

  it('keeps searches and browses with results for 7 days', () => {
    expect(musicBrainzTtlSeconds('release-group?query=a&fmt=json', results)).toBe(7 * DAY_SECONDS);
    expect(
      musicBrainzTtlSeconds(`release-group?artist=${ARTIST_ID}&type=album&fmt=json`, results),
    ).toBe(7 * DAY_SECONDS);
  });

  it('keeps an empty search for a day, so a new artist is found soon after it is added', () => {
    expect(musicBrainzTtlSeconds('artist?query=a&fmt=json', { artists: [], count: 0 })).toBe(
      DAY_SECONDS,
    );
    expect(
      musicBrainzTtlSeconds(`release-group?artist=${ARTIST_ID}&fmt=json`, {
        'release-groups': [],
        'release-group-count': 0,
      }),
    ).toBe(DAY_SECONDS);
  });

  it('does not mistake a body with no lists for an empty result', () => {
    expect(musicBrainzTtlSeconds('artist?query=a&fmt=json', { count: 0 })).toBe(7 * DAY_SECONDS);
    expect(musicBrainzTtlSeconds('artist?query=a&fmt=json', null)).toBe(7 * DAY_SECONDS);
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

  describe('caching', () => {
    const budget = new AbortController().signal;
    const RESULTS = { 'release-groups': [{ id: 'rg-1' }] };

    function jsonResponse(body: unknown, status = 200): Response {
      return new Response(JSON.stringify(body), { status });
    }

    beforeEach(() => {
      configureLookupCache(createInMemoryCacheStore());
    });

    afterEach(() => {
      configureLookupCache(null);
    });

    it('serves a repeat request from the cache, with no request and no rate-limit wait', async () => {
      mockFetch.mockResolvedValue(jsonResponse(RESULTS));
      const first = musicBrainzFetch('release-group?query=jeopardy&fmt=json', budget);
      await vi.runAllTimersAsync();
      await first;
      const timersBefore = vi.getTimerCount();

      // No timers are advanced: a request that waited for a slot would never resolve.
      const second = await musicBrainzFetch('release-group?query=jeopardy&fmt=json', budget);

      expect(await second.json()).toEqual(RESULTS);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(timersBefore);
    });

    it('treats different paths as different requests', async () => {
      mockFetch.mockImplementation(async () => jsonResponse(RESULTS));

      const requests = [
        musicBrainzFetch('release-group?query=a&fmt=json', budget),
        musicBrainzFetch('release-group?query=b&fmt=json', budget),
      ];
      await vi.runAllTimersAsync();
      await Promise.all(requests);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not keep a 503, so the next request tries again', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ error: 'busy' }, 503));
      const busy = musicBrainzFetch('artist?query=a&fmt=json', budget);
      await vi.runAllTimersAsync();
      expect((await busy).status).toBe(503);
      mockFetch.mockClear();
      mockFetch.mockResolvedValue(jsonResponse({ artists: [{ id: 'x' }] }));

      const retry = musicBrainzFetch('artist?query=a&fmt=json', budget);
      await vi.runAllTimersAsync();

      expect((await retry).status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not keep other errors either', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ error: 'Not Found' }, 404));

      const first = musicBrainzFetch(`artist/${ARTIST_ID}?fmt=json`, budget);
      await vi.runAllTimersAsync();
      await first;
      const second = musicBrainzFetch(`artist/${ARTIST_ID}?fmt=json`, budget);
      await vi.runAllTimersAsync();
      await second;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('still lets the caller read the body of a response it cached', async () => {
      mockFetch.mockResolvedValue(jsonResponse(RESULTS));

      const request = musicBrainzFetch('release-group?query=a&fmt=json', budget);
      await vi.runAllTimersAsync();

      expect(await (await request).json()).toEqual(RESULTS);
    });
  });
});
