import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShare } from './useShare';

const TARGET = {
  url: 'https://plinth.example/album/the-sound-jeopardy',
  title: 'Jeopardy by The Sound',
  text: 'A tightly coiled record.',
};

const writeText = vi.fn();
const nativeShare = vi.fn();

function setPointer(coarse: boolean): void {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: coarse }) as unknown as typeof window.matchMedia;
}

function setNativeShare(available: boolean): void {
  Object.defineProperty(navigator, 'share', {
    value: available ? nativeShare : undefined,
    configurable: true,
  });
}

function setClipboard(available: boolean): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: available ? { writeText } : undefined,
    configurable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  writeText.mockResolvedValue(undefined);
  nativeShare.mockResolvedValue(undefined);
  window.prompt = vi.fn();
  setPointer(false);
  setNativeShare(false);
  setClipboard(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useShare', () => {
  describe('with a mouse', () => {
    it('copies the link and says so, then goes back to normal', async () => {
      const { result } = renderHook(() => useShare());

      await act(() => result.current.share(TARGET));

      expect(writeText).toHaveBeenCalledWith(TARGET.url);
      expect(result.current.status).toBe('copied');

      await act(async () => {
        vi.advanceTimersByTime(2500);
      });
      expect(result.current.status).toBe('idle');
    });

    it('copies even when the browser has a share sheet, since a desktop share sheet is rarely wanted', async () => {
      setNativeShare(true);
      const { result } = renderHook(() => useShare());

      await act(() => result.current.share(TARGET));

      expect(nativeShare).not.toHaveBeenCalled();
      expect(writeText).toHaveBeenCalledWith(TARGET.url);
    });
  });

  describe('on a touch device', () => {
    beforeEach(() => {
      setPointer(true);
      setNativeShare(true);
    });

    it('opens the share sheet with the title, text and link', async () => {
      const { result } = renderHook(() => useShare());

      await act(() => result.current.share(TARGET));

      expect(nativeShare).toHaveBeenCalledWith(TARGET);
      expect(writeText).not.toHaveBeenCalled();
      expect(result.current.status).toBe('idle');
    });

    it('does nothing more when the person closes the sheet without choosing', async () => {
      nativeShare.mockRejectedValue(new DOMException('Share canceled', 'AbortError'));
      const { result } = renderHook(() => useShare());

      await act(() => result.current.share(TARGET));

      expect(writeText).not.toHaveBeenCalled();
      expect(window.prompt).not.toHaveBeenCalled();
      expect(result.current.status).toBe('idle');
    });

    it('copies the link when the share sheet fails', async () => {
      nativeShare.mockRejectedValue(new Error('not allowed'));
      const { result } = renderHook(() => useShare());

      await act(() => result.current.share(TARGET));

      expect(writeText).toHaveBeenCalledWith(TARGET.url);
      expect(result.current.status).toBe('copied');
    });

    it('copies the link when the browser has no share sheet', async () => {
      setNativeShare(false);
      const { result } = renderHook(() => useShare());

      await act(() => result.current.share(TARGET));

      expect(writeText).toHaveBeenCalledWith(TARGET.url);
    });
  });

  describe('when copying is not possible', () => {
    it('shows the link to copy by hand when the clipboard is refused', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      const { result } = renderHook(() => useShare());

      await act(() => result.current.share(TARGET));

      expect(window.prompt).toHaveBeenCalledWith('Copy this link', TARGET.url);
      expect(result.current.status).toBe('idle');
    });

    it('shows the link to copy by hand when there is no clipboard, as on an insecure page', async () => {
      setClipboard(false);
      const { result } = renderHook(() => useShare());

      await act(() => result.current.share(TARGET));

      expect(window.prompt).toHaveBeenCalledWith('Copy this link', TARGET.url);
    });
  });

  it('copes with a browser that has no matchMedia', async () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    setNativeShare(true);
    const { result } = renderHook(() => useShare());

    await act(() => result.current.share(TARGET));

    expect(writeText).toHaveBeenCalledWith(TARGET.url);
  });

  it('stops the reset timer when it goes away', async () => {
    const { result, unmount } = renderHook(() => useShare());
    await act(() => result.current.share(TARGET));

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
