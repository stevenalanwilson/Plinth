import React, { useRef, useState } from 'react';
import { HistoryEntry } from '../../types/history';
import { FeedbackStatus } from '../../types/feedback';
import { downloadLibrary, parseLibraryFile } from '../../services/libraryExport';
import { ConfirmButton } from '../../components/ConfirmButton';
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
  readonly onClear: () => void;
  readonly onImport: (entries: HistoryEntry[]) => void;
  /** Sets or clears the answer on an album. */
  readonly onFeedback: (id: string, status: FeedbackStatus | null) => void;
  readonly onOpenInsights: () => void;
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
  onClear,
  onImport,
  onFeedback,
  onOpenInsights,
}: CratePageProps): React.ReactElement {
  const [filter, setFilter] = useState<CrateFilter>('all');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const counts = countCrate(history);
  const shown = filterCrate(history, filter);
  const isEmpty = history.length === 0;

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    // Reset input so the same file can be re-selected if needed
    e.target.value = '';
    void parseLibraryFile(file)
      .then((entries) => onImport(entries))
      .catch((err: unknown) => {
        setImportError(err instanceof Error ? err.message : 'Failed to import file.');
      });
  }

  return (
    <section className="crate" aria-labelledby="crate-title">
      <div className="crate-header">
        <h2 id="crate-title" className="crate-title">
          Your crate
        </h2>
        <div className="crate-actions">
          <button type="button" className="crate-action" onClick={onOpenInsights}>
            Insights
          </button>
          <button
            type="button"
            className="crate-action"
            onClick={() => fileInputRef.current?.click()}
          >
            Import
          </button>
          <button
            type="button"
            className="crate-action"
            disabled={isEmpty}
            onClick={() => downloadLibrary(history)}
          >
            Export
          </button>
          <ConfirmButton
            label="Clear crate"
            confirmLabel="Tap again to clear it all"
            className="crate-action crate-action-danger"
            disabled={isEmpty}
            onConfirm={onClear}
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          aria-label="Import a crate file"
          className="visually-hidden"
          tabIndex={-1}
          onChange={handleImportFile}
        />
      </div>

      {importError !== null && (
        <p className="crate-import-error" role="alert">
          {importError}{' '}
          <button type="button" aria-label="Dismiss" onClick={() => setImportError(null)}>
            ✕
          </button>
        </p>
      )}

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
