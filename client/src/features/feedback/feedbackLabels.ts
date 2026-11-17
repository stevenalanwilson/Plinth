import { FeedbackStatus } from '../../types/feedback';

// Keyed on FeedbackStatus, so adding a status without a label fails the type check.
export const FEEDBACK_LABELS: Record<FeedbackStatus, string> = {
  save: 'Save',
  own: 'Own it',
  'want-vinyl': 'Want on vinyl',
  heard: 'Heard it',
  'not-for-me': 'Not for me',
};
