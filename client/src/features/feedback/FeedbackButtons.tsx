import React, { useId } from 'react';
import { FEEDBACK_STATUSES, FeedbackStatus } from '../../types/feedback';
import { FEEDBACK_LABELS } from './feedbackLabels';

interface FeedbackButtonsProps {
  /** The verdict already given, or null for none. */
  readonly status: FeedbackStatus | null;
  readonly onChange: (status: FeedbackStatus | null) => void;
}

/** Five ways to answer a pick. One at a time; tapping the chosen one again takes it back. */
export function FeedbackButtons({ status, onChange }: FeedbackButtonsProps): React.ReactElement {
  const headingId = useId();

  return (
    <div className="feedback" role="group" aria-labelledby={headingId}>
      <div id={headingId} className="feedback-heading">
        Your take
      </div>
      <div className="feedback-buttons">
        {FEEDBACK_STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            className="feedback-button"
            data-status={value}
            aria-pressed={status === value}
            onClick={() => onChange(status === value ? null : value)}
          >
            {FEEDBACK_LABELS[value]}
          </button>
        ))}
      </div>
    </div>
  );
}
