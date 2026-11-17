export const FEEDBACK_STATUSES = ['save', 'own', 'want-vinyl', 'heard', 'not-for-me'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** What the listener said about an album. One status at a time; tapping it again clears it. */
export interface Feedback {
  /**
   * Null once a rating has been cleared. The timestamp is kept, so that when libraries are later
   * synced between devices, "cleared" can be told apart from "never rated" and a stale copy
   * can't bring a cleared rating back.
   */
  readonly status: FeedbackStatus | null;
  /** ISO 8601: when the status last changed, so the newer of two copies wins. */
  readonly at: string;
}

function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return FEEDBACK_STATUSES.some((status) => status === value);
}

/** Reads feedback from stored or imported data, ignoring anything malformed. */
export function parseFeedback(raw: unknown): Feedback | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { status, at } = raw as Record<string, unknown>;
  if (status !== null && !isFeedbackStatus(status)) return undefined;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return undefined;
  return { status, at };
}
