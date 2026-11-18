import { UsageRepository } from './usageRepository';

export function createInMemoryUsageRepository(): UsageRepository {
  const counts = new Map<string, { subject: string; day: string; count: number }>();
  const keyOf = (subject: string, day: string): string => `${day}|${subject}`;

  return {
    async tryConsume(subject: string, day: string, limit: number): Promise<boolean> {
      const key = keyOf(subject, day);
      const current = counts.get(key)?.count ?? 0;
      if (current >= limit) return false;
      counts.set(key, { subject, day, count: current + 1 });
      return true;
    },

    async release(subject: string, day: string): Promise<void> {
      const entry = counts.get(keyOf(subject, day));
      if (entry && entry.count > 0) entry.count -= 1;
    },

    async deleteBefore(day: string): Promise<number> {
      let removed = 0;
      for (const [key, entry] of counts) {
        if (entry.day < day) {
          counts.delete(key);
          removed += 1;
        }
      }
      return removed;
    },
  };
}
