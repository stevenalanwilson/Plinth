import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../services/apiClient', () => ({
  fetchArtistSuggestions: vi.fn(),
}));

import { fetchArtistSuggestions } from '../../services/apiClient';
import { useArtistSuggestions } from './useArtistSuggestions';

const mockFetch = vi.mocked(fetchArtistSuggestions);

const NIRVANAS = [
  { id: 'a1', name: 'Nirvana', detail: 'US grunge band' },
  { id: 'a2', name: 'Nirvana', detail: '60s band from the UK' },
];

function setup(
  query: string,
  crateArtists: string[] = [],
  isEnabled = true,
): ReturnType<
  typeof renderHook<ReturnType<typeof useArtistSuggestions>, { query: string; isEnabled: boolean }>
> {
  return renderHook(
    (props: { query: string; isEnabled: boolean }) =>
      useArtistSuggestions({ ...props, crateArtists }),
    { initialProps: { query, isEnabled } },
  );
}

async function pause(ms = 300): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ suggestions: NIRVANAS });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useArtistSuggestions', () => {
  it('offers the artists the server finds, with what tells them apart, once typing pauses', async () => {
    const { result } = setup('nirv');

    expect(result.current.options).toEqual([]);
    await pause();

    expect(result.current.options).toEqual([
      { key: 'mb:a1', name: 'Nirvana', detail: 'US grunge band', artistId: 'a1' },
      { key: 'mb:a2', name: 'Nirvana', detail: '60s band from the UK', artistId: 'a2' },
    ]);
  });

  it('asks once for a run of keystrokes, not once for each', async () => {
    const { rerender } = setup('ni');

    await pause(100);
    rerender({ query: 'nir', isEnabled: true });
    await pause(100);
    rerender({ query: 'nirv', isEnabled: true });
    await pause();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('nirv', expect.any(AbortSignal));
  });

  it('drops the question being asked when another is asked', async () => {
    const { rerender } = setup('nirv');
    await pause();
    const firstSignal = mockFetch.mock.calls[0][1] as AbortSignal;

    rerender({ query: 'nirva', isEnabled: true });

    expect(firstSignal.aborted).toBe(true);
  });

  it.each(['', 'n', ' n '])('does not ask for %j, which is too short', async (query) => {
    setup(query);

    await pause();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not ask when suggestions are not wanted', async () => {
    const { result } = setup('nirv', ['Nirvana'], false);

    await pause();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.options).toEqual([]);
  });

  it('does not ask again for what it was told a moment ago', async () => {
    const { rerender } = setup('nirv');
    await pause();
    rerender({ query: 'nir', isEnabled: true });
    await pause();
    mockFetch.mockClear();

    rerender({ query: 'nirv', isEnabled: true });
    await pause();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('asks again, rather than reuse an empty answer, which may only mean the server was busy', async () => {
    mockFetch.mockResolvedValue({ suggestions: [] });
    const { rerender } = setup('nirv');
    await pause();
    rerender({ query: 'nir', isEnabled: true });
    await pause();
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ suggestions: NIRVANAS });

    rerender({ query: 'nirv', isEnabled: true });
    await pause();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  describe('searching', () => {
    it('is searching from the moment someone types until the server has answered', async () => {
      const { result } = setup('nirv');

      expect(result.current.isSearching).toBe(true);
      await pause(100);
      expect(result.current.isSearching).toBe(true);
      await pause();

      expect(result.current.isSearching).toBe(false);
    });

    it('is not searching for text too short to look up, or when suggestions are not wanted', () => {
      expect(setup('n').result.current.isSearching).toBe(false);
      expect(setup('nirv', [], false).result.current.isSearching).toBe(false);
    });

    it('stops when the request fails, rather than spinning for ever', async () => {
      mockFetch.mockRejectedValue(new Error('offline'));

      const { result } = setup('nirv');
      await pause();

      expect(result.current.isSearching).toBe(false);
    });

    it('stops when the server answers with nothing', async () => {
      mockFetch.mockResolvedValue({ suggestions: [] });

      const { result } = setup('xqzv');
      await pause();

      expect(result.current.isSearching).toBe(false);
    });

    it('starts again when the text changes, and stays searching until that is answered', async () => {
      const { result, rerender } = setup('nirv');
      await pause();

      rerender({ query: 'nirvan', isEnabled: true });

      expect(result.current.isSearching).toBe(true);
      await pause();
      expect(result.current.isSearching).toBe(false);
    });

    it('is not searching for something it already knows the answer to', async () => {
      const { result, rerender } = setup('nirv');
      await pause();
      rerender({ query: 'nir', isEnabled: true });
      await pause();

      rerender({ query: 'nirv', isEnabled: true });

      expect(result.current.isSearching).toBe(false);
    });
  });

  it('offers artists in the crate at once, before the server has answered', () => {
    const { result } = setup('tal', ['Talk Talk', 'Can', 'Mark Hollis']);

    expect(result.current.options).toEqual([
      { key: 'crate:talk talk', name: 'Talk Talk', detail: 'In your crate', artistId: null },
    ]);
  });

  it('finds a crate artist by the start of a later word, and not by the middle of one', () => {
    const { result } = setup('hol', ['Mark Hollis', 'Charles Holland', 'Can']);

    expect(result.current.options.map((option) => option.name)).toEqual([
      'Mark Hollis',
      'Charles Holland',
    ]);
    expect(setup('ollis', ['Mark Hollis']).result.current.options).toEqual([]);
  });

  it('replaces a crate artist with the server’s version of them, which has an ID', async () => {
    const { result } = setup('nirv', ['Nirvana']);
    expect(result.current.options.map((option) => option.key)).toEqual(['crate:nirvana']);

    await pause();

    expect(result.current.options.map((option) => option.key)).toEqual(['mb:a1', 'mb:a2']);
  });

  it('puts the crate first and lists each crate artist once', async () => {
    mockFetch.mockResolvedValue({
      suggestions: [{ id: 'a9', name: 'Talk Talk', detail: 'Group · GB' }],
    });
    const { result } = setup('talk', ['Talk Show Host', 'Talk Show Host']);
    await pause();

    expect(result.current.options.map((option) => option.name)).toEqual([
      'Talk Show Host',
      'Talk Talk',
    ]);
  });

  it('gives no suggestions from the server, and carries on, when the request fails', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));

    const { result } = setup('nirv', ['Nirvana']);
    await pause();

    expect(result.current.options.map((option) => option.key)).toEqual(['crate:nirvana']);
  });

  it('does not show an old answer for text that has changed since', async () => {
    const { result, rerender } = setup('nirv');
    await pause();

    rerender({ query: 'nirvana tribute', isEnabled: true });

    expect(result.current.options).toEqual([]);
  });
});
