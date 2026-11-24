import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListResponse } from '@shared/types';

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  fetchOwnLists: vi.fn(),
}));

import { fetchOwnLists } from '../../services/apiClient';
import { MyListsPage } from './MyListsPage';

const mockFetchOwn = vi.mocked(fetchOwnLists);
const onOpen = vi.fn();

function listOf(qualifier: ListResponse['qualifier'], albumCount: number): ListResponse {
  return {
    id: `code-${qualifier}`,
    kind: 'top',
    qualifier,
    size: 3,
    title: `title of ${qualifier}`,
    albums: Array.from({ length: albumCount }, (_unused, index) => ({
      slug: `slug-${index}`,
      releaseGroupId: `rg-${qualifier}-${index}`,
      artist: 'Artist',
      album: `Album ${index}`,
      year: '1999',
      hook: null,
      genres: [],
      country: null,
      artworkUrl: null,
      appleMusicUrl: null,
    })),
    updatedAt: '2026-11-24T12:00:00.000Z',
    isOwner: true,
  };
}

async function openPage(): Promise<HTMLElement> {
  render(<MyListsPage onOpen={onOpen} />);
  return screen.findByRole('list', { name: 'Your lists' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchOwn.mockResolvedValue({ lists: [] });
});

describe('MyListsPage', () => {
  it('says it is loading, then offers the top 3 of all time to start when there are no lists', async () => {
    render(<MyListsPage onOpen={onOpen} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your lists');

    const items = within(await screen.findByRole('list', { name: 'Your lists' }));

    expect(items.getAllByRole('listitem')).toHaveLength(1);
    expect(items.getByText('My top 3 albums of all time')).toBeInTheDocument();
    expect(items.getByText('Not started')).toBeInTheDocument();
  });

  it('opens the list of all time to start it', async () => {
    await openPage();

    await userEvent.click(
      screen.getByRole('button', { name: 'Start My top 3 albums of all time' }),
    );

    expect(onOpen).toHaveBeenCalledWith('all-time');
  });

  it('shows each list made, with how far along it is, the one for all time first', async () => {
    mockFetchOwn.mockResolvedValue({
      lists: [listOf('genre:jazz', 3), listOf('all-time', 2)],
    });

    const items = within(await openPage()).getAllByRole('listitem');

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('My top 3 albums of all time');
    expect(items[0]).toHaveTextContent('2 of 3 chosen');
    expect(items[1]).toHaveTextContent('My top 3 jazz albums');
    expect(items[1]).toHaveTextContent('Finished, ready to share');
  });

  it('opens a list made, to edit it', async () => {
    mockFetchOwn.mockResolvedValue({ lists: [listOf('genre:jazz', 1)] });
    await openPage();

    await userEvent.click(screen.getByRole('button', { name: 'Edit My top 3 jazz albums' }));

    expect(onOpen).toHaveBeenCalledWith('genre:jazz');
  });

  it('offers each genre that has no list yet, and opens it to start', async () => {
    mockFetchOwn.mockResolvedValue({ lists: [listOf('genre:jazz', 1)] });
    await openPage();
    const genres = within(screen.getByRole('list', { name: 'Genres' }));

    expect(genres.queryByRole('button', { name: 'Jazz' })).not.toBeInTheDocument();
    await userEvent.click(genres.getByRole('button', { name: 'Hip-hop' }));

    expect(onOpen).toHaveBeenCalledWith('genre:hip-hop');
  });

  it('says it could not load, and tries again when asked', async () => {
    mockFetchOwn.mockRejectedValueOnce(new Error('network down'));
    render(<MyListsPage onOpen={onOpen} />);

    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't load your lists");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByRole('list', { name: 'Your lists' });
  });
});
