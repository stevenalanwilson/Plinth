import { DAILY_LIMIT_CODE } from '@shared/types';

/** Why a request failed, as far as what is shown is concerned. */
export interface Failure {
  readonly message: string;
  /** The day's picks are used up. Nothing is wrong, so it shouldn't look as if something is. */
  readonly isLimitReached: boolean;
}

function codeOf(error: unknown): unknown {
  return error instanceof Error ? (error as Error & { code?: unknown }).code : undefined;
}

export function toFailure(error: unknown, fallback: string): Failure {
  return {
    message: error instanceof Error ? error.message : fallback,
    isLimitReached: codeOf(error) === DAILY_LIMIT_CODE,
  };
}
