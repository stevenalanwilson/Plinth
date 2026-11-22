import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTutorialPlayback } from './useTutorialPlayback';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTutorialPlayback', () => {
  it('counts up while playing', () => {
    const { result } = renderHook(() => useTutorialPlayback(true));

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(result.current).toBe(600);
  });

  it('holds still while paused, and carries on from there', () => {
    const { result, rerender } = renderHook(({ playing }) => useTutorialPlayback(playing), {
      initialProps: { playing: true },
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });
    rerender({ playing: false });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(300);

    rerender({ playing: true });
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(result.current).toBe(420);
  });
});
