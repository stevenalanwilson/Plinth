import React from 'react';

/**
 * The look of a pill you can switch on: the genres, the moods and the vibes to start from.
 * Kept in one place so they stay the same.
 */
export function pillStyle(isSelected: boolean): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: 20,
    fontSize: 12,
    fontFamily: 'var(--mono)',
    cursor: 'pointer',
    userSelect: 'none',
    border: '1px solid',
    background: isSelected ? 'var(--accent)' : 'var(--surface2)',
    color: isSelected ? '#0e0e0f' : 'var(--text)',
    borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
  };
}
