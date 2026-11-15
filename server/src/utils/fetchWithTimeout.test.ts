import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWithTimeout } from './fetchWithTimeout';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true });
});

describe('fetchWithTimeout', () => {
  it('passes the request options through to fetch', async () => {
    await fetchWithTimeout('https://example.org', new AbortController().signal, {
      headers: { 'User-Agent': 'test' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.org',
      expect.objectContaining({ headers: { 'User-Agent': 'test' } }),
    );
  });

  it('aborts the request when the budget signal aborts', async () => {
    const budget = new AbortController();
    await fetchWithTimeout('https://example.org', budget.signal);
    const { signal } = mockFetch.mock.calls[0][1] as RequestInit;

    expect(signal?.aborted).toBe(false);
    budget.abort();
    expect(signal?.aborted).toBe(true);
  });
});
