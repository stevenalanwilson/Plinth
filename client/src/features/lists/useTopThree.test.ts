import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AlbumResponse, ListResponse } from '@shared/types';

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  fetchOwnLists: vi.fn(),
  createList: vi.fn(),
  replaceList: vi.fn(),
  deleteList: vi.fn(),
}));

import {
  ApiError,
  createList,
  deleteList,
  fetchOwnLists,
  replaceList,
} from '../../services/apiClient';
import { PickedAlbum } from './topThree';
import { useTopThree } from './useTopThree';

const mockFetchOwn = vi.mocked(fetchOwnLists);
const mockCreate = vi.mocked(createList);
const mockReplace = vi.mocked(replaceList);
const mockDelete = vi.mocked(deleteList);

const pick = (id: string): PickedAlbum => ({
  releaseGroupId: id,
  artist: `Artist ${id}`,
  album: `Album ${id}`,
  year: '1999',
});
const A = pick('a');
const B = pick('b');
const C = pick('c');

function saved(...ids: string[]): ListResponse {
  return {
    id: 'abcdefghjk',
    kind: 'top',
    qualifier: 'all-time',
    size: 3,
    title: 'My top 3 albums of all time',
    albums: ids.map(
      (id): AlbumResponse => ({
        slug: `slug-${id}`,
        releaseGroupId: id,
        artist: `Artist ${id}`,
        album: `Album ${id}`,
        year: '1999',
        hook: null,
        genres: [],
        country: null,
        artworkUrl: null,
        appleMusicUrl: null,
      }),
    ),
    updatedAt: '2026-11-24T12:00:00.000Z',
    isOwner: true,
  };
}

const ids = (albums: readonly PickedAlbum[]): string[] => albums.map((a) => a.releaseGroupId);

async function loaded(): Promise<
  ReturnType<typeof renderHook<ReturnType<typeof useTopThree>, unknown>>
> {
  const view = renderHook(() => useTopThree());
  await waitFor(() => expect(view.result.current.status).toBe('ready'));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchOwn.mockResolvedValue({ lists: [] });
});

describe('useTopThree loading', () => {
  it('starts loading, then is ready with an empty list when none was saved', async () => {
    const view = renderHook(() => useTopThree());
    expect(view.result.current.status).toBe('loading');

    await waitFor(() => expect(view.result.current.status).toBe('ready'));

    expect(view.result.current.albums).toEqual([]);
    expect(view.result.current.hasSavedList).toBe(false);
    expect(view.result.current.isDirty).toBe(false);
  });

  it('shows the list that was saved, in order', async () => {
    mockFetchOwn.mockResolvedValue({ lists: [saved('b', 'a')] });

    const { result } = await loaded();

    expect(ids(result.current.albums)).toEqual(['b', 'a']);
    expect(result.current.hasSavedList).toBe(true);
    expect(result.current.isDirty).toBe(false);
  });

  it('ignores lists of other kinds', async () => {
    mockFetchOwn.mockResolvedValue({ lists: [{ ...saved('a'), kind: 'other' as never }] });

    const { result } = await loaded();

    expect(result.current.albums).toEqual([]);
  });

  it('says it could not load, rather than showing an empty list that saving would then clash with', async () => {
    mockFetchOwn.mockRejectedValue(new Error('network down'));

    const view = renderHook(() => useTopThree());
    await waitFor(() => expect(view.result.current.status).toBe('failed'));

    expect(view.result.current.albums).toEqual([]);
  });

  it('tries again when asked', async () => {
    mockFetchOwn.mockRejectedValueOnce(new Error('network down'));
    const view = renderHook(() => useTopThree());
    await waitFor(() => expect(view.result.current.status).toBe('failed'));

    act(() => view.result.current.reload());
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
  });
});

describe('useTopThree editing', () => {
  it('adds, moves and removes albums, and knows when it differs from what was saved', async () => {
    const { result } = await loaded();

    act(() => result.current.add(A));
    act(() => result.current.add(B));
    act(() => result.current.add(C));
    expect(ids(result.current.albums)).toEqual(['a', 'b', 'c']);
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.move(2, -1));
    expect(ids(result.current.albums)).toEqual(['a', 'c', 'b']);

    act(() => result.current.moveTo(0, 2));
    expect(ids(result.current.albums)).toEqual(['c', 'b', 'a']);

    act(() => result.current.remove(1));
    expect(ids(result.current.albums)).toEqual(['c', 'a']);
  });

  it('is no longer different once it is put back as it was saved', async () => {
    mockFetchOwn.mockResolvedValue({ lists: [saved('a', 'b')] });
    const { result } = await loaded();

    act(() => result.current.move(0, 1));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.move(0, 1));

    expect(result.current.isDirty).toBe(false);
  });

  it('does not take more than three, or the same album twice', async () => {
    const { result } = await loaded();

    act(() => result.current.add(A));
    act(() => result.current.add(A));
    act(() => result.current.add(B));
    act(() => result.current.add(C));
    act(() => result.current.add(pick('d')));

    expect(ids(result.current.albums)).toEqual(['a', 'b', 'c']);
    expect(result.current.isFull).toBe(true);
  });
});

describe('useTopThree saving', () => {
  it('makes the list the first time', async () => {
    mockCreate.mockResolvedValue(saved('a', 'b'));
    const { result } = await loaded();
    act(() => result.current.add(A));
    act(() => result.current.add(B));

    await act(() => result.current.save());

    expect(mockCreate).toHaveBeenCalledWith({
      kind: 'top',
      qualifier: 'all-time',
      releaseGroupIds: ['a', 'b'],
    });
    expect(result.current.saveState).toBe('saved');
    expect(result.current.isDirty).toBe(false);
    expect(result.current.hasSavedList).toBe(true);
  });

  it('changes the list it has, after that', async () => {
    mockFetchOwn.mockResolvedValue({ lists: [saved('a')] });
    mockReplace.mockResolvedValue(saved('a', 'b'));
    const { result } = await loaded();
    act(() => result.current.add(B));

    await act(() => result.current.save());

    expect(mockReplace).toHaveBeenCalledWith('abcdefghjk', ['a', 'b']);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.current.saveState).toBe('saved');
  });

  it('goes back to idle when edited after saving', async () => {
    mockCreate.mockResolvedValue(saved('a'));
    const { result } = await loaded();
    act(() => result.current.add(A));
    await act(() => result.current.save());

    act(() => result.current.add(B));

    expect(result.current.saveState).toBe('idle');
    expect(result.current.isDirty).toBe(true);
  });

  it('says why it failed, and keeps what was built', async () => {
    mockCreate.mockRejectedValue(new ApiError("One of those albums couldn't be found.", 422));
    const { result } = await loaded();
    act(() => result.current.add(A));

    await act(() => result.current.save());

    expect(result.current.saveState).toBe('failed');
    expect(result.current.saveError).toBe("One of those albums couldn't be found.");
    expect(ids(result.current.albums)).toEqual(['a']);
    expect(result.current.isDirty).toBe(true);
  });

  it('can be tried again after a failure', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network down')).mockResolvedValue(saved('a'));
    const { result } = await loaded();
    act(() => result.current.add(A));
    await act(() => result.current.save());

    await act(() => result.current.save());

    expect(result.current.saveState).toBe('saved');
    expect(result.current.saveError).toBeNull();
  });

  it('does not save twice at once', async () => {
    let finish: (list: ListResponse) => void = () => undefined;
    mockCreate.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = await loaded();
    act(() => result.current.add(A));

    act(() => void result.current.save());
    act(() => void result.current.save());
    await act(async () => finish(saved('a')));

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('has nothing to save for an empty list that was never saved', async () => {
    const { result } = await loaded();

    await act(() => result.current.save());

    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('useTopThree deleting', () => {
  it('removes the saved list and empties the builder', async () => {
    mockFetchOwn.mockResolvedValue({ lists: [saved('a', 'b')] });
    mockDelete.mockResolvedValue(undefined);
    const { result } = await loaded();

    await act(() => result.current.discard());

    expect(mockDelete).toHaveBeenCalledWith('abcdefghjk');
    expect(result.current.albums).toEqual([]);
    expect(result.current.hasSavedList).toBe(false);
    expect(result.current.isDirty).toBe(false);
  });

  it('keeps the list, and says why, when it could not be deleted', async () => {
    mockFetchOwn.mockResolvedValue({ lists: [saved('a')] });
    mockDelete.mockRejectedValue(new Error('network down'));
    const { result } = await loaded();

    await act(() => result.current.discard());

    expect(result.current.saveError).toBe('network down');
    expect(ids(result.current.albums)).toEqual(['a']);
    expect(result.current.hasSavedList).toBe(true);
  });

  it('only forgets what was built when there is nothing saved to delete', async () => {
    const { result } = await loaded();
    act(() => result.current.add(A));

    await act(() => result.current.discard());

    expect(mockDelete).not.toHaveBeenCalled();
    expect(result.current.albums).toEqual([]);
  });
});
