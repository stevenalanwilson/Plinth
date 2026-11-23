import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlbumResponse, ListResponse } from '@shared/types';

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  fetchOwnLists: vi.fn(),
  createList: vi.fn(),
  replaceList: vi.fn(),
  deleteList: vi.fn(),
}));

vi.mock('./useAlbumSearch', () => ({ useAlbumSearch: vi.fn() }));

import {
  ApiError,
  createList,
  deleteList,
  fetchOwnLists,
  replaceList,
} from '../../services/apiClient';
import { PickedAlbum } from './topThree';
import { AlbumOption, useAlbumSearch } from './useAlbumSearch';
import { TopThreePage } from './TopThreePage';

const mockFetchOwn = vi.mocked(fetchOwnLists);
const mockCreate = vi.mocked(createList);
const mockReplace = vi.mocked(replaceList);
const mockDelete = vi.mocked(deleteList);
const mockSearch = vi.mocked(useAlbumSearch);

const BLUE: PickedAlbum = {
  releaseGroupId: 'rg-blue',
  artist: 'Miles Davis',
  album: 'Kind of Blue',
  year: '1959',
};
const NEVERMIND: PickedAlbum = {
  releaseGroupId: 'rg-nevermind',
  artist: 'Nirvana',
  album: 'Nevermind',
  year: '1991',
};
const THRILLER: PickedAlbum = {
  releaseGroupId: 'rg-thriller',
  artist: 'Michael Jackson',
  album: 'Thriller',
  year: null,
};
function optionFor(album: PickedAlbum): AlbumOption {
  return { key: album.releaseGroupId, name: album.album, detail: album.artist, album };
}

function savedList(...albums: PickedAlbum[]): ListResponse {
  return {
    id: 'abcdefghjk',
    kind: 'top',
    qualifier: 'all-time',
    size: 3,
    title: 'My top 3 albums of all time',
    albums: albums.map(
      (a): AlbumResponse => ({
        slug: `slug-${a.releaseGroupId}`,
        ...a,
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

let searchState: { options: AlbumOption[]; isSearching: boolean; hasFailed: boolean };

async function openPage(crate: PickedAlbum[] = []): Promise<void> {
  render(<TopThreePage crateAlbums={crate} />);
  await screen.findByRole('list', { name: 'Your top 3' });
}

/** The albums in the three slots, in order, by title; an empty slot is "empty". */
function slotTitles(): string[] {
  return within(screen.getByRole('list', { name: 'Your top 3' }))
    .getAllByRole('listitem')
    .map((slot) => slot.querySelector('.top-three-title')?.textContent ?? 'empty');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchOwn.mockResolvedValue({ lists: [] });
  searchState = { options: [], isSearching: false, hasFailed: false };
  mockSearch.mockImplementation(() => searchState);
});

describe('TopThreePage loading', () => {
  it('says it is loading, then shows three empty slots', async () => {
    render(<TopThreePage crateAlbums={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your list');

    await screen.findByRole('list', { name: 'Your top 3' });

    expect(slotTitles()).toEqual(['empty', 'empty', 'empty']);
  });

  it('shows the list that was saved, in order, with each album’s artist and year', async () => {
    mockFetchOwn.mockResolvedValue({ lists: [savedList(NEVERMIND, BLUE)] });

    await openPage();

    expect(slotTitles()).toEqual(['Nevermind', 'Kind of Blue', 'empty']);
    const slots = screen.getAllByRole('listitem');
    expect(slots[0]).toHaveTextContent('Nirvana · 1991');
  });

  it('says it could not load, and tries again when asked', async () => {
    mockFetchOwn.mockRejectedValueOnce(new Error('network down'));
    render(<TopThreePage crateAlbums={[]} />);

    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't load your list");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByRole('list', { name: 'Your top 3' });
  });
});

describe('TopThreePage adding', () => {
  it('puts a chosen album in the first empty slot, and clears the search', async () => {
    await openPage();
    searchState.options = [optionFor(BLUE)];
    const box = screen.getByRole('combobox', { name: 'Search for an album' });

    await userEvent.type(box, 'kind');
    await userEvent.click(screen.getByRole('option', { name: /Kind of Blue/ }));

    expect(slotTitles()).toEqual(['Kind of Blue', 'empty', 'empty']);
    expect(box).toHaveValue('');
  });

  it('offers the crate to the search, and leaves out albums already chosen', async () => {
    await openPage([NEVERMIND]);
    searchState.options = [optionFor(BLUE)];
    await userEvent.type(screen.getByRole('combobox'), 'kind');
    await userEvent.click(screen.getByRole('option', { name: /Kind of Blue/ }));

    const lastCall = mockSearch.mock.calls[mockSearch.mock.calls.length - 1][0];
    expect(lastCall.crateAlbums).toEqual([NEVERMIND]);
    expect(lastCall.excluded).toEqual(['rg-blue']);
    expect(lastCall.isEnabled).toBe(true);
  });

  it('shuts the search, and says why, once the list is full', async () => {
    mockFetchOwn.mockResolvedValue({ lists: [savedList(BLUE, NEVERMIND, THRILLER)] });

    await openPage();

    expect(screen.getByRole('combobox', { name: 'Search for an album' })).toBeDisabled();
    expect(screen.getByText(/Your list is full/)).toBeInTheDocument();
    expect(mockSearch.mock.calls[mockSearch.mock.calls.length - 1][0].isEnabled).toBe(false);
  });

  it('says the search failed, so it is not mistaken for no matches', async () => {
    await openPage();
    searchState.hasFailed = true;

    await userEvent.type(screen.getByRole('combobox'), 'kind');

    expect(screen.getByText(/Search isn't available right now/)).toBeInTheDocument();
  });
});

describe('TopThreePage reordering and removing', () => {
  beforeEach(() => {
    mockFetchOwn.mockResolvedValue({ lists: [savedList(BLUE, NEVERMIND, THRILLER)] });
  });

  it('moves an album up and down with buttons', async () => {
    await openPage();

    await userEvent.click(screen.getByRole('button', { name: 'Move Nevermind up' }));
    expect(slotTitles()).toEqual(['Nevermind', 'Kind of Blue', 'Thriller']);

    await userEvent.click(screen.getByRole('button', { name: 'Move Kind of Blue down' }));
    expect(slotTitles()).toEqual(['Nevermind', 'Thriller', 'Kind of Blue']);
  });

  it('cannot move the first album up or the last down', async () => {
    await openPage();

    expect(screen.getByRole('button', { name: 'Move Kind of Blue up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Thriller down' })).toBeDisabled();
  });

  it('cannot move the last album of a part-filled list into an empty slot', async () => {
    mockFetchOwn.mockResolvedValue({ lists: [savedList(BLUE, NEVERMIND)] });
    await openPage();

    expect(screen.getByRole('button', { name: 'Move Nevermind down' })).toBeDisabled();
  });

  it('keeps focus on the same album’s button after it moves', async () => {
    await openPage();

    await userEvent.click(screen.getByRole('button', { name: 'Move Nevermind up' }));

    // It is now first, where "up" no longer applies, so focus goes to the other way.
    expect(screen.getByRole('button', { name: 'Move Nevermind down' })).toHaveFocus();
  });

  it('removes an album and closes the gap', async () => {
    await openPage();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Nevermind' }));

    expect(slotTitles()).toEqual(['Kind of Blue', 'Thriller', 'empty']);
  });

  it('reorders by dragging one slot onto another', async () => {
    await openPage();
    const slots = screen.getAllByRole('listitem');

    fireEvent.dragStart(slots[0], { dataTransfer: { setData: vi.fn(), effectAllowed: '' } });
    fireEvent.dragOver(slots[2]);
    fireEvent.drop(slots[2]);

    expect(slotTitles()).toEqual(['Nevermind', 'Thriller', 'Kind of Blue']);
  });

  it('ignores a drop that did not start from a slot', async () => {
    await openPage();

    fireEvent.drop(screen.getAllByRole('listitem')[1]);

    expect(slotTitles()).toEqual(['Kind of Blue', 'Nevermind', 'Thriller']);
  });
});

describe('TopThreePage saving', () => {
  it('has nothing to save until something changes', async () => {
    mockFetchOwn.mockResolvedValue({ lists: [savedList(BLUE)] });

    await openPage();

    expect(screen.getByRole('button', { name: 'Save my top 3' })).toBeDisabled();
  });

  it('saves a new list, and says it is saved', async () => {
    mockCreate.mockResolvedValue(savedList(BLUE));
    await openPage();
    searchState.options = [optionFor(BLUE)];
    await userEvent.type(screen.getByRole('combobox'), 'kind');
    await userEvent.click(screen.getByRole('option'));

    await userEvent.click(screen.getByRole('button', { name: 'Save my top 3' }));

    expect(mockCreate).toHaveBeenCalledWith({
      kind: 'top',
      qualifier: 'all-time',
      releaseGroupIds: ['rg-blue'],
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save my top 3' })).toBeDisabled();
  });

  it('changes the saved list, once there is one', async () => {
    mockFetchOwn.mockResolvedValue({ lists: [savedList(BLUE, NEVERMIND)] });
    mockReplace.mockResolvedValue(savedList(NEVERMIND, BLUE));
    await openPage();

    await userEvent.click(screen.getByRole('button', { name: 'Move Nevermind up' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save my top 3' }));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('abcdefghjk', ['rg-nevermind', 'rg-blue']),
    );
  });

  it('says why a save failed, and leaves the list as built', async () => {
    mockCreate.mockRejectedValue(new ApiError("Albums can't be looked up right now.", 503));
    await openPage();
    searchState.options = [optionFor(BLUE)];
    await userEvent.type(screen.getByRole('combobox'), 'kind');
    await userEvent.click(screen.getByRole('option'));

    await userEvent.click(screen.getByRole('button', { name: 'Save my top 3' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Albums can't be looked up");
    expect(slotTitles()).toEqual(['Kind of Blue', 'empty', 'empty']);
  });

  it('says how many albums are chosen', async () => {
    mockFetchOwn.mockResolvedValue({ lists: [savedList(BLUE, NEVERMIND)] });

    await openPage();

    expect(screen.getByText('2 of 3 chosen')).toBeInTheDocument();
  });
});

describe('TopThreePage deleting', () => {
  it('offers to delete only a list that was saved', async () => {
    await openPage();

    expect(screen.queryByRole('button', { name: /Delete my top 3/ })).not.toBeInTheDocument();
  });

  it('asks twice, then deletes the list and empties the slots', async () => {
    mockFetchOwn.mockResolvedValue({ lists: [savedList(BLUE, NEVERMIND)] });
    mockDelete.mockResolvedValue(undefined);
    await openPage();

    await userEvent.click(screen.getByRole('button', { name: 'Delete my top 3' }));
    expect(mockDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Tap again to delete' }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('abcdefghjk'));
    await waitFor(() => expect(slotTitles()).toEqual(['empty', 'empty', 'empty']));
  });
});
