import React, { useState } from 'react';
import { HistoryEntry } from '../../types/history';
import { HistoryItem } from './HistoryItem';

const VISIBLE_COUNT = 9;

interface HistoryGridProps {
  history: HistoryEntry[];
  onRemove: (id: string) => void;
  onSelect: (id: string) => void;
}

export function HistoryGrid({ history, onRemove, onSelect }: HistoryGridProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);

  const visible = isExpanded ? history : history.slice(0, VISIBLE_COUNT);
  const hiddenCount = history.length - VISIBLE_COUNT;

  return (
    <section>
      <h3
        style={{
          fontSize: 11,
          color: 'var(--muted)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginBottom: 16,
        }}
      >
        Previously suggested
      </h3>
      <div className="history-grid">
        {visible.map((entry) => (
          <HistoryItem key={entry.id} entry={entry} onRemove={onRemove} onSelect={onSelect} />
        ))}
      </div>
      {hiddenCount > 0 && !isExpanded && (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '10px',
            fontSize: 11,
            color: 'var(--muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontFamily: 'var(--mono)',
            cursor: 'pointer',
          }}
        >
          Show {hiddenCount} more
        </button>
      )}
      {isExpanded && history.length > VISIBLE_COUNT && (
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '10px',
            fontSize: 11,
            color: 'var(--muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontFamily: 'var(--mono)',
            cursor: 'pointer',
          }}
        >
          Show less
        </button>
      )}
    </section>
  );
}
