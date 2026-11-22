import React, { useState } from 'react';
import { HistoryEntry } from '../../types/history';
import { FeedbackStatus } from '../../types/feedback';
import { HistoryItem } from '../history/HistoryItem';
import { WantList } from './WantList';
import {
  countCrate,
  CRATE_FILTER_LABELS,
  CRATE_FILTERS,
  CrateFilter,
  filterCrate,
} from './crateFilters';

interface CratePageProps {
  readonly history: readonly HistoryEntry[];
  /** Brings an album back as the pick on screen. */
  readonly onSelect: (id: string) => void;
  readonly onRemove: (id: string) => void;
  /** Sets or clears the answer on an album. */
  readonly onFeedback: (id: string, status: FeedbackStatus | null) => void;
}

const EMPTY_MESSAGES: Record<CrateFilter, string> = {
  all: 'Only albums marked Not for me so far.',
  save: 'Nothing saved yet.',
  own: 'No albums marked as owned yet.',
  'want-vinyl': 'Nothing on your want list yet. Tap Want on vinyl on a pick to add it.',
  heard: 'No albums marked as heard yet.',
  'not-for-me': 'Nothing marked Not for me.',
};

/** Everything the listener has been picked and what they said about it, filterable by answer. */
export function CratePage({
  history,
  onSelect,
  onRemove,
  onFeedback,
}: CratePageProps): React.ReactElement {
  const [filter, setFilter] = useState<CrateFilter>('all');

  const counts = countCrate(history);
  const shown = filterCrate(history, filter);
  const isEmpty = history.length === 0;

  return (
    <section className="crate" aria-label="Your Crate">
      {isEmpty ? (
        <p className="crate-empty">
          Your crate is empty. Albums Plinth picks for you appear here. Mark the ones you own or
          want and Plinth will remember them. You can also import a crate you exported before.
        </p>
      ) : (
        <>
          <div className="crate-filters" role="group" aria-label="Filter by answer">
            {CRATE_FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                className="crate-filter"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {CRATE_FILTER_LABELS[value]}
                <span className="crate-filter-count">{counts[value]}</span>
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="crate-empty">{EMPTY_MESSAGES[filter]}</p>
          ) : filter === 'want-vinyl' ? (
            <WantList entries={shown} onSelect={onSelect} onGotIt={(id) => onFeedback(id, 'own')} />
          ) : (
            <div className="history-grid">
              {shown.map((entry) => (
                <HistoryItem key={entry.id} entry={entry} onRemove={onRemove} onSelect={onSelect} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
