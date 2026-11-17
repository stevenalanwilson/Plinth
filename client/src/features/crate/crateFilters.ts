import { HistoryEntry } from '../../types/history';
import { FEEDBACK_STATUSES, FeedbackStatus } from '../../types/feedback';

export type CrateFilter = 'all' | FeedbackStatus;

export const CRATE_FILTERS: readonly CrateFilter[] = ['all', ...FEEDBACK_STATUSES];

// Keyed on CrateFilter, so adding a status without a label fails the type check.
export const CRATE_FILTER_LABELS: Record<CrateFilter, string> = {
  all: 'All',
  save: 'Saved',
  own: 'Own it',
  'want-vinyl': 'Want on vinyl',
  heard: 'Heard it',
  'not-for-me': 'Not for me',
};

/**
 * "All" is the crate as a collection, so it leaves out what the listener marked "Not for me";
 * those have a filter of their own.
 */
export function inCrateFilter(entry: HistoryEntry, filter: CrateFilter): boolean {
  const status = entry.feedback?.status ?? null;
  if (filter === 'all') return status !== 'not-for-me';
  return status === filter;
}

export function filterCrate(history: readonly HistoryEntry[], filter: CrateFilter): HistoryEntry[] {
  return history.filter((entry) => inCrateFilter(entry, filter));
}

export function countCrate(history: readonly HistoryEntry[]): Record<CrateFilter, number> {
  const counts = Object.fromEntries(CRATE_FILTERS.map((filter) => [filter, 0])) as Record<
    CrateFilter,
    number
  >;
  for (const entry of history) {
    for (const filter of CRATE_FILTERS) {
      if (inCrateFilter(entry, filter)) counts[filter] += 1;
    }
  }
  return counts;
}
