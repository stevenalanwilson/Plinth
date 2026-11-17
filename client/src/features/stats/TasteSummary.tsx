import React from 'react';
import { HistoryEntry } from '../../types/history';
import { describeTaste } from './describeTaste';

interface TasteSummaryProps {
  readonly history: readonly HistoryEntry[];
}

/** A plain-English line about the listener's taste, or a nudge to keep going until there's one. */
export function TasteSummary({ history }: TasteSummaryProps): React.ReactElement {
  const taste = describeTaste(history);

  return (
    <section className="taste-summary" aria-labelledby="taste-summary-title">
      <h2 id="taste-summary-title" className="taste-summary-title">
        Your taste
      </h2>
      {taste ? (
        <>
          <p className="taste-summary-text">{taste.text}</p>
          <p className="taste-summary-note">
            Worked out from {taste.albumCount} {taste.albumCount === 1 ? 'album' : 'albums'}. The
            ones you own or want count most.
          </p>
        </>
      ) : (
        <p className="taste-summary-note">
          Keep going. After a few more picks, and a verdict on the ones you know, Plinth will
          describe your taste here.
        </p>
      )}
    </section>
  );
}
