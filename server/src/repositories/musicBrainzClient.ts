import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { cachedResponse } from './lookupCache';

const MUSICBRAINZ_BASE_URL = 'https://musicbrainz.org/ws/2';
// MusicBrainz allows 1 request per second per client and blocks IPs that exceed it.
const MIN_REQUEST_INTERVAL_MS = 1000;

/**
 * Hands out request slots at least `intervalMs` apart and returns how long the caller must
 * wait for its slot. Shared across all callers, so concurrent lookups queue instead of
 * bursting, and an idle client pays no delay at all.
 */
export function createRequestSpacer(
  intervalMs: number,
  now: () => number = () => Date.now(),
): () => number {
  let nextSlotAt = 0;
  return () => {
    const current = now();
    const slot = Math.max(current, nextSlotAt);
    nextSlotAt = slot + intervalMs;
    return slot - current;
  };
}

const reserveSlot = createRequestSpacer(MIN_REQUEST_INTERVAL_MS);

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timeoutId);
      reject(signal.reason);
    };
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function userAgent(): string {
  // MusicBrainz asks clients to identify themselves with a way to contact the maintainer.
  const contact = process.env.MUSICBRAINZ_CONTACT;
  return contact ? `AlbumRecommender/1.0 ( ${contact} )` : 'AlbumRecommender/1.0';
}

export function escapeLucene(value: string): string {
  return value.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&');
}

// MusicBrainz answers 503 when it is throttling us or simply busy, even at a polite rate,
// so a 503 is worth a few retries before callers treat it as "no results". Busy spells
// usually clear within a second or two but can last several, hence four attempts.
const MAX_ATTEMPTS = 4;
const MAX_RETRY_AFTER_MS = 5000;

function retryDelayMs(res: Response, attempt: number): number {
  const retryAfterSeconds = Number(res.headers.get('retry-after'));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, MAX_RETRY_AFTER_MS);
  }
  return attempt * MIN_REQUEST_INTERVAL_MS;
}

const DAY_SECONDS = 24 * 60 * 60;
// A lookup by ID, e.g. `artist/<mbid>?inc=artist-rels`, as opposed to a search or a browse.
const LOOKUP_BY_ID = /^[a-z-]+\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?:[?/]|$)/i;

function isEmptyResult(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const lists = Object.values(body).filter(Array.isArray);
  return lists.length > 0 && lists.every((list) => list.length === 0);
}

/**
 * How long to keep a successful response. A record changes rarely, so a lookup by ID keeps for
 * 30 days; searches and browses keep for 7, so new releases show up within a week; an empty
 * result keeps for a day, so an artist added to MusicBrainz is found soon after.
 */
export function musicBrainzTtlSeconds(path: string, body: unknown): number {
  if (LOOKUP_BY_ID.test(path)) return 30 * DAY_SECONDS;
  return isEmptyResult(body) ? DAY_SECONDS : 7 * DAY_SECONDS;
}

async function fetchFromMusicBrainz(path: string, budgetSignal: AbortSignal): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const delayMs = reserveSlot();
    if (delayMs > 0) await sleep(delayMs, budgetSignal);

    const res = await fetchWithTimeout(`${MUSICBRAINZ_BASE_URL}/${path}`, budgetSignal, {
      headers: { 'User-Agent': userAgent() },
    });
    if (res.status !== 503 || attempt === MAX_ATTEMPTS) return res;

    await res.body?.cancel();
    await sleep(retryDelayMs(res, attempt), budgetSignal);
  }
}

/**
 * GET a MusicBrainz web-service path (e.g. `artist?query=...`). A cached response skips the
 * request and the rate limit; otherwise the request waits for its slot and retries when busy.
 */
export function musicBrainzFetch(path: string, budgetSignal: AbortSignal): Promise<Response> {
  return cachedResponse({
    namespace: 'musicbrainz',
    key: path,
    ttlSeconds: (body) => musicBrainzTtlSeconds(path, body),
    fetch: () => fetchFromMusicBrainz(path, budgetSignal),
  });
}
