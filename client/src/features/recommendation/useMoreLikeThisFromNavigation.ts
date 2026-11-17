import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PivotHint } from '@shared/types';
import { pivotFromState } from './moreLikeThis';

/**
 * Starts the "more like this" pick an album page asked for when it sent the visitor here. The
 * request is cleared from history first, so going back and forward or reloading doesn't ask
 * again (each pick is a paid-for call).
 */
export function useMoreLikeThisFromNavigation(start: (pivot: PivotHint) => void): void {
  const location = useLocation();
  const navigate = useNavigate();
  // Strict mode runs effects twice in development; this keeps it to one pick.
  const started = useRef(false);

  useEffect(() => {
    const pivot = pivotFromState(location.state);
    if (!pivot || started.current) return;
    started.current = true;
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    start(pivot);
  }, [location, navigate, start]);
}
