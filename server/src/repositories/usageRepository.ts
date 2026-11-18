/**
 * Counts of how much each visitor has used something on each day. A day is a UTC date written
 * as YYYY-MM-DD, so every instance agrees on when it ends.
 */
export interface UsageRepository {
  /**
   * Adds one to the subject's count for the day, unless it has already reached the limit.
   * Returns whether it was added. The check and the addition are one step, so requests arriving
   * together can't all squeeze under the limit.
   */
  tryConsume(subject: string, day: string, limit: number): Promise<boolean>;

  /** Takes one back, for a use that was counted and then turned away somewhere else. */
  release(subject: string, day: string): Promise<void>;

  /** Removes the counts for days before this one, returning how many rows went. */
  deleteBefore(day: string): Promise<number>;
}
