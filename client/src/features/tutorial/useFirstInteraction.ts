import { useEffect, useRef } from 'react';

/**
 * Calls back the first time the visitor taps, clicks or presses a key anywhere on the page.
 * Pointer movement and wheel scrolling don't count, since they don't mean someone has started.
 */
export function useFirstInteraction(isListening: boolean, onInteraction: () => void): void {
  const callback = useRef(onInteraction);
  callback.current = onInteraction;

  useEffect(() => {
    if (!isListening) return;
    const handle = (): void => callback.current();
    // Capture, so a control that stops the event from bubbling still counts.
    document.addEventListener('pointerdown', handle, true);
    document.addEventListener('keydown', handle, true);
    return () => {
      document.removeEventListener('pointerdown', handle, true);
      document.removeEventListener('keydown', handle, true);
    };
  }, [isListening]);
}
