import { PivotHint } from '@shared/types';
import { useStartFromNavigation } from '../../hooks/useStartFromNavigation';
import { pivotFromState } from './moreLikeThis';

/** Starts the "more like this" pick an album page asked for when it sent the visitor here. */
export function useMoreLikeThisFromNavigation(start: (pivot: PivotHint) => void): void {
  useStartFromNavigation(pivotFromState, start);
}
