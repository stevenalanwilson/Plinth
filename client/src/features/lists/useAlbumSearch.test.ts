import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../services/apiClient', () => ({
  searchAlbums: vi.fn(),
}));

import { searchAlbums } from '../../services/apiClient';
import { PickedAlbum } from './topThree';
import { AlbumOption, useAlbumSearch } from './useAlbumSearch';

const mockSearch = vi.mocked(searchAlbums);

const BLUE = {
  releaseGroupId: 'rg-blue',
  artist: 'Miles Davis',
  album: 'Kind of Blue',
  year: '1959',
};
const BLUES = {
  releaseGroupId: 'rg-blues',
  artist: 'The Blues Vision',
  album: 'Kind of Blues',
  year: null,
};

const NEVERMIND: PickedAlbum = {
  releaseGroupId: 'rg-nevermind',
  artist: 'Nirvana',
  album: 'Nevermind',
  year: '1991',
};

interface Props {
  readonly query: string;
  readonly isEnabled: boolean;
  readonly excluded: string[];
}

function setup(
  query: string,
  {
    crate = [],
    isEnabled = true,
    excluded = [],
  }: { crate?: PickedAlbum[]; isEnabled?: boolean; excluded?: string[] } = {},
): ReturnType<typeof renderHook<ReturnType<typeof useAlbumSearch>, Props>> {
  return renderHook((props: Props) => useAlbumSearch({ ...props, crateAlbums: crate }), {
    initialProps: { query, isEnabled, excluded },
  });
}

async function pause(ms = 500): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const names = (options: readonly AlbumOption[]): string[] => options.map((o) => o.name);

beforeEach(() => {
  vi.useFakeTimers();
  mockSearch.mockReset();
  mockSearch.mockResolvedValue({ results: [BLUE, BLUES] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAlbumSearch', () => {
  it('offers the albums the server finds, with the artist and year, once typing pauses', async () => {
    const { result } = setup('miles kind');

    await pause();

    expect(mockSearch).toHaveBeenCalledWith('miles kind', expect.any(AbortSignal));
    expect(result.current.options.map((o) => [o.name, o.detail])).toEqual([
      ['Kind of Blue', 'Miles Davis · 1959'],
      ['Kind of Blues', 'The Blues Vision'],
    ]);
    expect(result.current.options[0].album).toEqual(BLUE);
  });

  it('does not ask until typing pauses, and only for the last thing typed', async () => {
    const { rerender } = setup('mi');

    await pause(100);
    rerender({ query: 'mil', isEnabled: true, excluded: [] });
    await pause(100);
    rerender({ query: 'mile', isEnabled: true, excluded: [] });
    await pause();

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith('mile', expect.any(AbortSignal));
  });

  it('says it is searching from typing until the server answers', async () => {
    const { result } = setup('miles');

    expect(result.current.isSearching).toBe(true);
    await pause();
    expect(result.current.isSearching).toBe(false);
  });

  it.each([[''], [' '], ['m']])('does not search for %j, which is too short', async (query) => {
    const { result } = setup(query);

    await pause();

    expect(mockSearch).not.toHaveBeenCalled();
    expect(result.current.options).toEqual([]);
    expect(result.current.isSearching).toBe(false);
  });

  it('does not search while switched off', async () => {
    const { result } = setup('miles', { isEnabled: false });

    await pause();

    expect(mockSearch).not.toHaveBeenCalled();
    expect(result.current.options).toEqual([]);
  });

  it('offers albums from the crate at once, before the server answers, and says so', () => {
    const { result } = setup('nirv', { crate: [NEVERMIND] });

    expect(result.current.options).toEqual([
      expect.objectContaining({
        name: 'Nevermind',
        detail: 'Nirvana · 1991 · In your crate',
        album: NEVERMIND,
      }),
    ]);
    expect(result.current.isSearching).toBe(true);
  });

  it('matches the crate on the start of any word of the artist or the album', () => {
    const { result } = setup('never nir', { crate: [NEVERMIND] });

    expect(names(result.current.options)).toEqual(['Nevermind']);
  });

  it('offers no crate album that does not match every word typed', () => {
    const { result } = setup('nirvana thriller', { crate: [NEVERMIND] });

    expect(names(result.current.options)).toEqual([]);
  });

  it('puts the crate first, and does not offer an album twice', async () => {
    mockSearch.mockResolvedValue({ results: [BLUE, { ...NEVERMIND }] });
    const { result } = setup('nevermind', { crate: [NEVERMIND] });

    await pause();

    expect(names(result.current.options)).toEqual(['Nevermind', 'Kind of Blue']);
    expect(result.current.options[0].detail).toContain('In your crate');
  });

  it('does not offer an album that is already in the list', async () => {
    const { result } = setup('kind', { crate: [NEVERMIND], excluded: ['rg-blue', 'rg-nevermind'] });

    await pause();

    expect(names(result.current.options)).toEqual(['Kind of Blues']);
  });

  it('does not ask again for a question it has already had answered', async () => {
    const { rerender } = setup('miles');
    await pause();
    rerender({ query: 'mile', isEnabled: true, excluded: [] });
    await pause();

    rerender({ query: 'miles', isEnabled: true, excluded: [] });
    await pause();

    expect(mockSearch).toHaveBeenCalledTimes(2);
  });

  it('does not keep an empty answer, which may only mean the server was busy', async () => {
    mockSearch.mockResolvedValueOnce({ results: [] });
    const { rerender } = setup('zzzz');
    await pause();

    rerender({ query: 'zzz', isEnabled: true, excluded: [] });
    await pause();
    rerender({ query: 'zzzz', isEnabled: true, excluded: [] });
    await pause();

    expect(mockSearch.mock.calls.filter(([query]) => query === 'zzzz')).toHaveLength(2);
  });

  it('says the search failed, rather than that nothing matched, and keeps the crate’s albums', async () => {
    mockSearch.mockRejectedValue(new Error('unavailable'));
    const { result } = setup('nirv', { crate: [NEVERMIND] });

    await pause();

    expect(result.current.hasFailed).toBe(true);
    expect(result.current.isSearching).toBe(false);
    expect(names(result.current.options)).toEqual(['Nevermind']);
  });

  it('does not say it failed for a search that worked, or for new text', async () => {
    mockSearch.mockRejectedValueOnce(new Error('unavailable'));
    const { result, rerender } = setup('miles');
    await pause();
    expect(result.current.hasFailed).toBe(true);

    rerender({ query: 'miles d', isEnabled: true, excluded: [] });
    await pause();

    expect(result.current.hasFailed).toBe(false);
  });

  it('shows nothing from an earlier question for the text now typed', async () => {
    const { result, rerender } = setup('miles');
    await pause();

    rerender({ query: 'nirvana', isEnabled: true, excluded: [] });

    expect(result.current.options).toEqual([]);
  });
});
