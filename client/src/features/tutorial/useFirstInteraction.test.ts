import { describe, it, expect, vi } from 'vitest';
import { fireEvent, renderHook } from '@testing-library/react';
import { useFirstInteraction } from './useFirstInteraction';

describe('useFirstInteraction', () => {
  it('calls back on a tap or click anywhere', () => {
    const onInteraction = vi.fn();
    renderHook(() => useFirstInteraction(true, onInteraction));

    fireEvent.pointerDown(document.body);

    expect(onInteraction).toHaveBeenCalledTimes(1);
  });

  it('calls back on a key press', () => {
    const onInteraction = vi.fn();
    renderHook(() => useFirstInteraction(true, onInteraction));

    fireEvent.keyDown(document.body, { key: 'Tab' });

    expect(onInteraction).toHaveBeenCalledTimes(1);
  });

  it('ignores the pointer moving and the page scrolling', () => {
    const onInteraction = vi.fn();
    renderHook(() => useFirstInteraction(true, onInteraction));

    fireEvent.pointerMove(document.body);
    fireEvent.wheel(document.body);

    expect(onInteraction).not.toHaveBeenCalled();
  });

  it('stops listening once told to', () => {
    const onInteraction = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ listening }) => useFirstInteraction(listening, onInteraction),
      { initialProps: { listening: true } },
    );

    rerender({ listening: false });
    fireEvent.pointerDown(document.body);
    unmount();
    fireEvent.keyDown(document.body, { key: 'a' });

    expect(onInteraction).not.toHaveBeenCalled();
  });
});
