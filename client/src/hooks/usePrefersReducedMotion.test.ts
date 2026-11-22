import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface FakeMedia {
  matches: boolean;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

function fakeMatchMedia(initial: boolean): { media: FakeMedia; change: (next: boolean) => void } {
  const listeners = new Set<() => void>();
  const media: FakeMedia = {
    matches: initial,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => media);
  return {
    media,
    change: (next) => {
      media.matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePrefersReducedMotion', () => {
  it('is false when the browser cannot tell', () => {
    vi.stubGlobal('matchMedia', undefined);

    const { result } = renderHook(() => usePrefersReducedMotion());

    expect(result.current).toBe(false);
  });

  it('follows the device setting, including a change after load', () => {
    const { change } = fakeMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);

    act(() => change(false));

    expect(result.current).toBe(false);
  });
});
