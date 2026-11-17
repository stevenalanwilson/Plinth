/** A key-value cache whose entries expire. Values must survive a round trip through JSON. */
export interface CacheStore {
  /** The stored value, or null when there is none or it has expired. */
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  /** Removes expired entries and returns how many it removed. */
  deleteExpired(): Promise<number>;
}
