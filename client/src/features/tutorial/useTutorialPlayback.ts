import { useEffect, useState } from 'react';

const TICK_MS = 60;

/** How long the demo has been playing, in milliseconds. It holds still while paused. */
export function useTutorialPlayback(isPlaying: boolean): number {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => setElapsedMs((elapsed) => elapsed + TICK_MS), TICK_MS);
    return () => clearInterval(timer);
  }, [isPlaying]);

  return elapsedMs;
}
