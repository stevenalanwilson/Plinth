import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AlbumResponse, ListResponse } from '@shared/types';

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  fetchList: vi.fn(),
}));

import { ApiError, fetchList } from '../../services/apiClient';
import { ListPage } from './ListPage';

const mockFetchList = vi.mocked(fetchList);

function album(
  title: string,
  artist: string,
  year: string | null,
  cover: string | null,
): AlbumResponse {
  const slug = `${artist}-${title}`.toLowerCase().replace(/ /g, '-');
  return {
    slug,
    releaseGroupId: `rg-${slug}`,
    artist,
    album: title,
    year,
    hook: null,
    genres: [],
    country: null,
    artworkUrl: cover,
    appleMusicUrl: null,
  };
}

const NEVERMIND = album('Nevermind', 'Nirvana', '1991', 'https://img.example/nevermind.jpg');
const ABBEY = album('Abbey Road', 'The Beatles', '1969', null);
const BLUE = album('Kind of Blue', 'Miles Davis', null, 'https://img.example/blue.jpg');

function list(overrides: Partial<ListResponse> = {}): ListResponse {
  return {
    id: 'abcdefghjk',
    kind: 'top',
    qualifier: 'all-time',
    size: 3,
    title: 'My top 3 albums of all time',
    albums: [NEVERMIND, ABBEY, BLUE],
    updatedAt: '2026-11-24T12:00:00.000Z',
    isOwner: false,
    ...overrides,
  };
}

function Home(): React.ReactElement {
  return <div data-testid="home-state">{JSON.stringify(useLocation().state)}</div>;
}

function renderPage(id = 'abcdefghjk'): void {
  render(
    <MemoryRouter initialEntries={[`/list/${id}`]}>
      <Routes>
        <Route path="/list/:id" element={<ListPage />} />
        <Route path="/" element={<Home />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function shown(): Promise<void> {
  await screen.findByRole('heading', { level: 1 });
}

beforeEach(() => {
  vi.clearAllMocks();
  document.title = 'Plinth';
  mockFetchList.mockResolvedValue(list());
});

afterEach(() => {
  document.title = 'Plinth';
});

describe('ListPage', () => {
  it('says it is loading, then shows the list’s title', async () => {
    renderPage();
    expect(screen.getByText('Loading list…')).toBeInTheDocument();

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'My top 3 albums of all time',
    );
    expect(mockFetchList).toHaveBeenCalledWith('abcdefghjk', expect.any(AbortSignal));
  });

  it('names the browser tab for the list', async () => {
    renderPage();
    await shown();

    expect(document.title).toBe('My top 3 albums of all time · Plinth');
  });

  it('shows the albums in order, with their number, artist and year', async () => {
    renderPage();
    await shown();

    const items = within(screen.getByRole('list', { name: 'The albums, best first' })).getAllByRole(
      'listitem',
    );
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('1');
    expect(items[0]).toHaveTextContent('Nevermind');
    expect(items[0]).toHaveTextContent('Nirvana');
    expect(items[0]).toHaveTextContent('1991');
    expect(items[1]).toHaveTextContent('Abbey Road');
    expect(items[2]).toHaveTextContent('Kind of Blue');
    expect(items[2]).not.toHaveTextContent(/\b(19|20)\d\d\b/);
  });

  it('links each album to its own page', async () => {
    renderPage();
    await shown();

    expect(screen.getByRole('link', { name: 'Nevermind' })).toHaveAttribute(
      'href',
      '/album/nirvana-nevermind',
    );
  });

  it('shows each cover, and the placeholder sleeve where there is none', async () => {
    renderPage();
    await shown();

    // The covers are the same link as the titles, so they are hidden from screen readers.
    expect(
      screen.getByRole('img', { name: 'Nevermind album artwork', hidden: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Abbey Road by The Beatles, no artwork available',
        hidden: true,
      }),
    ).toBeInTheDocument();
  });

  it('offers listening links for each album, named for it', async () => {
    renderPage();
    await shown();

    const group = screen.getByRole('group', { name: 'Listen to Abbey Road' });
    expect(within(group).getAllByRole('link')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });
});

describe('ListPage for a visitor', () => {
  it('sends them to make their own top 3', async () => {
    renderPage();
    await shown();

    await userEvent.click(screen.getByRole('button', { name: 'Make your own top 3' }));

    expect(JSON.parse(screen.getByTestId('home-state').textContent ?? '')).toEqual({
      openTopThree: true,
    });
  });

  it('starts a pick like these albums, naming them in order', async () => {
    renderPage();
    await shown();

    await userEvent.click(screen.getByRole('button', { name: 'Find me something like these' }));

    expect(JSON.parse(screen.getByTestId('home-state').textContent ?? '')).toEqual({
      likeThese: [
        { artist: 'Nirvana', album: 'Nevermind' },
        { artist: 'The Beatles', album: 'Abbey Road' },
        { artist: 'Miles Davis', album: 'Kind of Blue' },
      ],
    });
  });

  it('offers the way to set a vibe instead', async () => {
    renderPage();
    await shown();

    expect(screen.getByRole('link', { name: 'Or set your own vibe' })).toHaveAttribute('href', '/');
  });

  it('does not offer to edit a list that is not theirs', async () => {
    renderPage();
    await shown();

    expect(screen.queryByRole('button', { name: 'Edit my top 3' })).not.toBeInTheDocument();
  });
});

describe('ListPage for the owner', () => {
  it('offers to edit it, in place of making one', async () => {
    mockFetchList.mockResolvedValue(list({ isOwner: true }));
    renderPage();
    await shown();

    expect(screen.queryByRole('button', { name: 'Make your own top 3' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit my top 3' }));

    expect(JSON.parse(screen.getByTestId('home-state').textContent ?? '')).toEqual({
      openTopThree: true,
    });
  });

  it('can still start a pick like their own albums', async () => {
    mockFetchList.mockResolvedValue(list({ isOwner: true }));
    renderPage();
    await shown();

    expect(
      screen.getByRole('button', { name: 'Find me something like these' }),
    ).toBeInTheDocument();
  });

  it('is told when the list is not finished, so it is not shared yet', async () => {
    mockFetchList.mockResolvedValue(list({ isOwner: true, albums: [NEVERMIND, ABBEY] }));
    renderPage();
    await shown();

    expect(screen.getByRole('status')).toHaveTextContent(
      "Your list isn't finished: add 1 more album to share it.",
    );
  });

  it('says nothing of the sort about a finished list', async () => {
    mockFetchList.mockResolvedValue(list({ isOwner: true }));
    renderPage();
    await shown();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('ListPage when it cannot show the list', () => {
  it('says the list could not be found, and offers a pick of their own', async () => {
    mockFetchList.mockRejectedValue(new ApiError('List not found', 404));
    renderPage();

    expect(await screen.findByText("We couldn't find that list.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get your own pick' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: 'Find me something like these' })).toBeNull();
  });

  it('says what went wrong, and tries again when asked', async () => {
    mockFetchList.mockRejectedValueOnce(new Error('Request timed out.')).mockResolvedValue(list());
    renderPage();
    expect(await screen.findByText('Request timed out.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
  });

  it('has the Plinth wordmark to go home by', async () => {
    renderPage();
    await shown();

    expect(screen.getByRole('link', { name: 'Plinth' })).toHaveAttribute('href', '/');
  });
});
