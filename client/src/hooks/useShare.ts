import { useCallback, useEffect, useRef, useState } from 'react';

export type ShareStatus = 'idle' | 'copied';

export interface ShareTarget {
  readonly url: string;
  readonly title: string;
  readonly text: string;
}

interface UseShareReturn {
  readonly status: ShareStatus;
  readonly share: (target: ShareTarget) => Promise<void>;
}

const COPIED_MESSAGE_MS = 2500;

// On a phone the share sheet is how people send things. On a desktop, where a few browsers
// offer one too, copying the link is what people want, so only touch devices get the sheet.
function prefersShareSheet(): boolean {
  return (
    typeof navigator.share === 'function' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

export function useShare(): UseShareReturn {
  const [status, setStatus] = useState<ShareStatus>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = useCallback(async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // No clipboard (an insecure page) or it was refused: let the person copy it by hand.
      window.prompt('Copy this link', url);
      return;
    }
    setStatus('copied');
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setStatus('idle'), COPIED_MESSAGE_MS);
  }, []);

  const share = useCallback(
    async (target: ShareTarget): Promise<void> => {
      if (prefersShareSheet()) {
        try {
          await navigator.share(target);
          return;
        } catch (error) {
          // Closing the sheet without choosing isn't a failure, and shouldn't copy anything.
          if (error instanceof DOMException && error.name === 'AbortError') return;
        }
      }
      await copy(target.url);
    },
    [copy],
  );

  return { status, share };
}
