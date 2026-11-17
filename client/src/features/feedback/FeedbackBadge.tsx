import React from 'react';
import { FeedbackStatus } from '../../types/feedback';
import { FEEDBACK_LABELS } from './feedbackLabels';

interface FeedbackBadgeProps {
  readonly status: FeedbackStatus | null | undefined;
}

/** A small label for an album's verdict, drawn over its cover; nothing when there isn't one. */
export function FeedbackBadge({ status }: FeedbackBadgeProps): React.ReactElement | null {
  if (!status) return null;
  return (
    <span className="feedback-badge" data-status={status}>
      {FEEDBACK_LABELS[status]}
    </span>
  );
}
