import { createInMemoryUsageRepository } from '../repositories/inMemoryUsageRepository';
import { createDailyPickLimiter, DailyPickLimiter } from '../services/dailyLimitService';

/** A daily limit nothing in a test will reach, for tests that are about something else. */
export function generousDailyLimit(): DailyPickLimiter {
  return createDailyPickLimiter({
    usage: createInMemoryUsageRepository(),
    limits: { perVisitor: 100_000, global: 100_000 },
  });
}
