const DEFAULT_FETCH_TIMEOUT_MS = 8000;

/**
 * Fetch that aborts after its own per-request timeout, or earlier if the caller's overall
 * budget signal fires — so a lookup made of several requests can't outlive its budget.
 */
export function fetchWithTimeout(
  url: string,
  budgetSignal: AbortSignal,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), budgetSignal]);
  return fetch(url, { ...init, signal });
}
