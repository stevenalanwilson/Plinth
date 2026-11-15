import { fetchWithTimeout } from '../utils/fetchWithTimeout';

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

/** GET a MusicBrainz web-service path (e.g. `artist?query=...`), respecting the rate limit. */
export async function musicBrainzFetch(path: string, budgetSignal: AbortSignal): Promise<Response> {
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
