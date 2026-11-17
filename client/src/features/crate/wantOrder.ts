import { HistoryEntry } from '../../types/history';

function answeredAt(entry: HistoryEntry): number {
  const time = Date.parse(entry.feedback?.at ?? '');
  return Number.isNaN(time) ? 0 : time;
}

/** The want list newest first by when each album was added to it, not by when it was picked. */
export function newestAnswerFirst(entries: readonly HistoryEntry[]): HistoryEntry[] {
  // sort is stable, so albums answered at the same moment keep their order.
  return [...entries].sort((a, b) => answeredAt(b) - answeredAt(a));
}
