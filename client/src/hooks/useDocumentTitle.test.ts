import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDocumentTitle } from './useDocumentTitle';

beforeEach(() => {
  document.title = 'Plinth';
});

describe('useDocumentTitle', () => {
  it('sets the title while showing, and puts it back on leaving', () => {
    const { unmount } = renderHook(() => useDocumentTitle('Nevermind by Nirvana · Plinth'));
    expect(document.title).toBe('Nevermind by Nirvana · Plinth');

    unmount();

    expect(document.title).toBe('Plinth');
  });

  it('leaves the title alone while there is none to set', () => {
    renderHook(() => useDocumentTitle(null));

    expect(document.title).toBe('Plinth');
  });

  it('follows the title as it changes', () => {
    const { rerender } = renderHook(({ title }) => useDocumentTitle(title), {
      initialProps: { title: null as string | null },
    });

    rerender({ title: 'Loaded · Plinth' });

    expect(document.title).toBe('Loaded · Plinth');
  });
});
