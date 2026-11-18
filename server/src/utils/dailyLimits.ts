import { DailyLimits } from '../services/dailyLimitService';

interface LimitEnvironment {
  readonly DAILY_PICK_LIMIT?: string;
  readonly DAILY_SIGNED_IN_PICK_LIMIT?: string;
  readonly GLOBAL_DAILY_PICK_LIMIT?: string;
}

// Starting guesses: enough for an evening of digging for most people, and a ceiling on a day's
// spend that a surprise wouldn't turn into a bill. Both can be changed without a deploy.
export const DEFAULT_DAILY_PICK_LIMIT = 25;
export const DEFAULT_DAILY_SIGNED_IN_PICK_LIMIT = 100;
export const DEFAULT_GLOBAL_DAILY_PICK_LIMIT = 1000;

function wholeNumber(name: string, value: string | undefined, fallback: number): number {
  const configured = value?.trim();
  if (!configured) return fallback;
  if (!/^\d+$/.test(configured)) {
    throw new Error(`${name} must be a whole number of picks (0 pauses picks), not "${value}"`);
  }
  return Number(configured);
}

/**
 * How many picks a visitor and a signed-in account can have in a day, and everyone together. A blank value means the
 * default, and anything but a whole number is refused rather than guessed at. Zero is allowed:
 * it pauses picks, which is the quickest way to stop spending.
 */
export function dailyPickLimits(env: LimitEnvironment): DailyLimits {
  return {
    perVisitor: wholeNumber('DAILY_PICK_LIMIT', env.DAILY_PICK_LIMIT, DEFAULT_DAILY_PICK_LIMIT),
    perAccount: wholeNumber(
      'DAILY_SIGNED_IN_PICK_LIMIT',
      env.DAILY_SIGNED_IN_PICK_LIMIT,
      DEFAULT_DAILY_SIGNED_IN_PICK_LIMIT,
    ),
    global: wholeNumber(
      'GLOBAL_DAILY_PICK_LIMIT',
      env.GLOBAL_DAILY_PICK_LIMIT,
      DEFAULT_GLOBAL_DAILY_PICK_LIMIT,
    ),
  };
}
