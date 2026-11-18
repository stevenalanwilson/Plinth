import { createHash } from 'crypto';
import { UsageRepository } from '../repositories/usageRepository';
import { logger } from '../logger';

const DAY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = DAY_MS;
const GLOBAL_SUBJECT = 'global';

export interface DailyLimits {
  /** Picks one visitor can have in a day. */
  readonly perVisitor: number;
  /** Picks everyone together can have in a day: the ceiling on what Plinth can spend. */
  readonly global: number;
}

/**
 * Who a pick is counted against: the device that asked, or, for a request that carries no device
 * token (storage blocked, or registration failed), the address it came from.
 */
export type Visitor =
  | { readonly kind: 'device'; readonly id: string }
  | { readonly kind: 'address'; readonly address: string };

/** Which limit turned a request away: the visitor's own, or the day's total. */
export type LimitScope = 'visitor' | 'global';

export class DailyLimitError extends Error {
  constructor(
    readonly scope: LimitScope,
    readonly limit: number,
  ) {
    super(scope === 'visitor' ? 'Daily pick limit reached' : 'Global daily pick limit reached');
    this.name = 'DailyLimitError';
  }
}

export interface DailyPickLimiter {
  /**
   * Counts one pick against the visitor and against the day's total. Throws a DailyLimitError if
   * either is used up, and counts nothing in that case.
   */
  consume(visitor: Visitor): Promise<void>;
}

/** The UTC date a moment falls on, as YYYY-MM-DD. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Whole seconds until the next midnight UTC, rounded up so nobody is told to come back early. */
export function secondsUntilNextDay(now: Date): number {
  const nextMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.ceil((nextMidnight - now.getTime()) / 1000);
}

// The address is hashed so the table never holds one as it is. Addresses are few enough to guess
// at, so this keeps them out of a casual look, not out of reach: the rows go within two days.
function subjectOf(visitor: Visitor): string {
  if (visitor.kind === 'device') return `device:${visitor.id}`;
  return `address:${createHash('sha256').update(visitor.address).digest('hex').slice(0, 32)}`;
}

interface Options {
  readonly usage: UsageRepository;
  readonly limits: DailyLimits;
  readonly now?: () => Date;
}

export function createDailyPickLimiter({
  usage,
  limits,
  now = (): Date => new Date(),
}: Options): DailyPickLimiter {
  return {
    async consume(visitor: Visitor): Promise<void> {
      const day = utcDay(now());
      const subject = subjectOf(visitor);
      try {
        if (!(await usage.tryConsume(subject, day, limits.perVisitor))) {
          throw new DailyLimitError('visitor', limits.perVisitor);
        }
        if (!(await usage.tryConsume(GLOBAL_SUBJECT, day, limits.global))) {
          // The visitor was counted first, so give it back: being turned away didn't use a pick.
          await usage.release(subject, day).catch(() => undefined);
          throw new DailyLimitError('global', limits.global);
        }
      } catch (error) {
        if (error instanceof DailyLimitError) throw error;
        // A problem reaching the counts shouldn't stop every pick. The albums need the same
        // database, so a real outage stops them anyway.
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'daily limit check failed',
        );
      }
    },
  };
}

/** Removes the counts for days before today, returning how many rows went. */
export function removeOldUsage(usage: UsageRepository, now: Date = new Date()): Promise<number> {
  return usage.deleteBefore(utcDay(now));
}

export function startUsageCleanup(
  usage: UsageRepository,
  intervalMs: number = CLEANUP_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    removeOldUsage(usage).catch((error: unknown) => {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'usage cleanup failed',
      );
    });
  }, intervalMs);
  // The timer must not keep the process alive on its own.
  timer.unref();
  return () => clearInterval(timer);
}
