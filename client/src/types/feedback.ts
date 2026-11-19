import { Feedback, FEEDBACK_STATUSES, FeedbackStatus } from '@shared/types';

export { FEEDBACK_STATUSES };
export type { Feedback, FeedbackStatus };

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
