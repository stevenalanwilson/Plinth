import React, { useRef, useState } from 'react';
import { HistoryEntry } from '../../types/history';
import { downloadLibrary, parseLibraryFile } from '../../services/libraryExport';
import { ConfirmButton } from '../../components/ConfirmButton';
import { PageHeader } from '../../components/PageHeader';

/** The pages under Crate in the main menu. */
export type CrateView = 'crate' | 'insights' | 'lists';

interface CrateMenuProps {
  readonly view: CrateView;
  readonly onNavigate: (view: CrateView) => void;
  readonly history: readonly HistoryEntry[];
  readonly onImport: (entries: HistoryEntry[]) => void;
  readonly onClear: () => void;
}

const VIEWS: readonly {
  readonly view: CrateView;
  readonly label: string;
  readonly title: string;
}[] = [
  { view: 'crate', label: 'My crate', title: 'Your Crate' },
  { view: 'insights', label: 'Insights', title: 'Insights' },
  { view: 'lists', label: 'My lists', title: 'My lists' },
];

/**
 * The row at the top of the Crate pages: which page this is, the way to the others, and what can
 * be done to the whole crate (on the pages about the crate itself). Shared so it stays put when
 * switching between them.
 */
export function CrateMenu({
  view,
  onNavigate,
  history,
  onImport,
  onClear,
}: CrateMenuProps): React.ReactElement {
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEmpty = history.length === 0;
  const title = VIEWS.find((item) => item.view === view)?.title ?? 'Your Crate';

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    // Emptied so choosing the same file again still counts as a change.
    e.target.value = '';
    void parseLibraryFile(file)
      .then((entries) => onImport(entries))
      .catch((err: unknown) => {
        setImportError(err instanceof Error ? err.message : 'Failed to import file.');
      });
  }

  return (
    <>
      <PageHeader title={title}>
        <div className="crate-actions">
          <nav className="crate-views" aria-label="Crate">
            {VIEWS.map((item) => (
              <button
                key={item.view}
                type="button"
                className="crate-action"
                aria-current={view === item.view ? 'page' : undefined}
                onClick={() => onNavigate(item.view)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          {view !== 'lists' && (
            <div className="crate-tools" role="group" aria-label="Crate actions">
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
          )}
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
      </PageHeader>

      {importError !== null && (
        <p className="crate-import-error" role="alert">
          {importError}{' '}
          <button type="button" aria-label="Dismiss" onClick={() => setImportError(null)}>
            ✕
          </button>
        </p>
      )}
    </>
  );
}
