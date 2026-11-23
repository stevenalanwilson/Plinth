import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Starts what another page asked for when it sent the visitor here, passing it on through the
 * navigation state. The request is cleared from history first, so going back and forward or
 * reloading doesn't ask again (a pick is a paid-for call). `read` returns what to start, or null
 * when the state holds no valid request.
 */
export function useStartFromNavigation<T>(
  read: (state: unknown) => T | null,
  start: (request: T) => void,
): void {
  const location = useLocation();
  const navigate = useNavigate();
  // Strict mode runs effects twice in development; this keeps it to one start.
  const started = useRef(false);

  useEffect(() => {
    const request = read(location.state);
    if (request === null || started.current) return;
    started.current = true;
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    start(request);
  }, [location, navigate, read, start]);
}
