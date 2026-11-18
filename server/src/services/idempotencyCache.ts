/** How long a finished result is kept for a retry to find. */
export const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

// Results are small and come from a rate-limited route, so this is a ceiling on memory, not a
// number anyone should reach.
const DEFAULT_MAX_ENTRIES = 500;

export interface IdempotentResult<T> {
  readonly value: T;
  /** True when this answer came from an earlier request with the same key. */
  readonly replayed: boolean;
}

export interface IdempotencyCache<T> {
  /**
   * Does the work the first time a key is seen, and answers every later request with that key from
   * the first result for ten minutes. A request that arrives while the work is still running
   * waits for it rather than starting more. A failure isn't kept: a retry does the work again.
   */
  run(key: string, work: () => Promise<T>): Promise<IdempotentResult<T>>;
}

interface Entry<T> {
  readonly result: Promise<T>;
  /** Null while the work is running. */
  expiresAt: number | null;
}

interface Options {
  readonly now?: () => number;
  readonly maxEntries?: number;
}

export function createIdempotencyCache<T>({
  now = Date.now,
  maxEntries = DEFAULT_MAX_ENTRIES,
}: Options = {}): IdempotencyCache<T> {
  const entries = new Map<string, Entry<T>>();
  let finished = 0;

  function forget(key: string, entry: Entry<T>): void {
    if (entries.get(key) !== entry) return;
    entries.delete(key);
    if (entry.expiresAt !== null) finished -= 1;
  }

  // Only finished results are let go: dropping work that is still running would let a retry
  // start it again, which is the thing this exists to stop.
  function makeRoom(): void {
    for (const [key, entry] of entries) {
      if (finished <= maxEntries) return;
      if (entry.expiresAt !== null) forget(key, entry);
    }
  }

  return {
    async run(key: string, work: () => Promise<T>): Promise<IdempotentResult<T>> {
      const existing = entries.get(key);
      if (existing) {
        const expired = existing.expiresAt !== null && existing.expiresAt <= now();
        if (!expired) return { value: await existing.result, replayed: true };
        forget(key, existing);
      }

      const entry: Entry<T> = { result: work(), expiresAt: null };
      entries.set(key, entry);

      try {
        const value = await entry.result;
        // Set only if still ours: a result is never kept twice.
        if (entries.get(key) === entry) {
          entry.expiresAt = now() + IDEMPOTENCY_TTL_MS;
          finished += 1;
          makeRoom();
        }
        return { value, replayed: false };
      } catch (error) {
        forget(key, entry);
        throw error;
      }
    },
  };
}
