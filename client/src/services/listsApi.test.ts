import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiError,
  createList,
  deleteList,
  fetchList,
  fetchOwnLists,
  replaceList,
  searchAlbums,
} from './apiClient';

const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

// Path and query only: the base URL comes from VITE_API_URL, which differs between machines.
function requestedUrl(call = 0): string {
  const url = new URL(String(fetchMock.mock.calls[call][0]), 'http://base.invalid');
  return `${url.pathname}${url.search}`;
}

function init(call = 0): RequestInit {
  return fetchMock.mock.calls[call][1] ?? {};
}

function headers(call = 0): Record<string, string> {
  return (init(call).headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
  fetchMock.mockResolvedValue(json({}));
  vi.stubGlobal('fetch', fetchMock);
  // A device that already has its token, so these tests see one request per call.
  localStorage.setItem('plinth-device-token', 'pld_existing');
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  localStorage.clear();
});

describe('searchAlbums', () => {
  it('asks the v1 API for albums, with what was typed in the query', async () => {
    fetchMock.mockResolvedValueOnce(json({ results: [] }));

    await searchAlbums('miles kind');

    expect(requestedUrl()).toBe('/api/v1/albums/search?q=miles+kind');
  });

  it('returns the albums found', async () => {
    const results = [
      { releaseGroupId: 'rg-1', artist: 'Miles Davis', album: 'Kind of Blue', year: '1959' },
    ];
    fetchMock.mockResolvedValueOnce(json({ results }));

    expect(await searchAlbums('miles')).toEqual({ results });
  });

  it('says why it failed, with the status, when the search is unavailable', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Album search is unavailable.' }, 503));

    await expect(searchAlbums('miles')).rejects.toMatchObject({
      message: 'Album search is unavailable.',
      status: 503,
    });
  });
});

describe('fetchOwnLists', () => {
  it('asks for this device’s lists, carrying its token', async () => {
    fetchMock.mockResolvedValueOnce(json({ lists: [] }));

    await fetchOwnLists();

    expect(requestedUrl()).toBe('/api/v1/lists');
    expect(headers().Authorization).toBe('Bearer pld_existing');
  });

  it('returns the lists', async () => {
    const lists = [{ id: 'abcdefghjk', albums: [] }];
    fetchMock.mockResolvedValueOnce(json({ lists }));

    expect(await fetchOwnLists()).toEqual({ lists });
  });

  it('does not ask, or get a token, for a browser that has none', async () => {
    localStorage.clear();

    expect(await fetchOwnLists()).toEqual({ lists: [] });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says there are none, and forgets the token, when the server does not know it', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Invalid or expired device token.' }, 401));

    expect(await fetchOwnLists()).toEqual({ lists: [] });

    expect(localStorage.getItem('plinth-device-token')).toBeNull();
  });

  it('fails when the server does', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Something went wrong.' }, 500));

    await expect(fetchOwnLists()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('createList', () => {
  const request = {
    kind: 'top',
    qualifier: 'all-time',
    releaseGroupIds: ['rg-1', 'rg-2'],
  } as const;

  it('posts the list as this device', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'abcdefghjk' }, 201));

    await createList(request);

    expect(requestedUrl()).toBe('/api/v1/lists');
    expect(init().method).toBe('POST');
    expect(headers().Authorization).toBe('Bearer pld_existing');
    expect(JSON.parse(String(init().body))).toEqual(request);
  });

  it('returns the list that was made', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'abcdefghjk', albums: [] }, 201));

    expect(await createList(request)).toEqual({ id: 'abcdefghjk', albums: [] });
  });

  it('says why it failed, with the status, so a second list can be told apart', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'You already have a list of that kind.' }, 409));

    await expect(createList(request)).rejects.toMatchObject({ status: 409 });
  });
});

describe('replaceList', () => {
  it('puts the albums, in order, to the list', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'abcdefghjk' }));

    await replaceList('abcdefghjk', ['rg-2', 'rg-1']);

    expect(requestedUrl()).toBe('/api/v1/lists/abcdefghjk');
    expect(init().method).toBe('PUT');
    expect(headers().Authorization).toBe('Bearer pld_existing');
    expect(JSON.parse(String(init().body))).toEqual({ releaseGroupIds: ['rg-2', 'rg-1'] });
  });

  it('says it was not found when the list is gone or is not this device’s', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'List not found' }, 404));

    await expect(replaceList('abcdefghjk', [])).rejects.toMatchObject({ status: 404 });
  });
});

describe('deleteList', () => {
  it('deletes the list as this device', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await deleteList('abcdefghjk');

    expect(requestedUrl()).toBe('/api/v1/lists/abcdefghjk');
    expect(init().method).toBe('DELETE');
    expect(headers().Authorization).toBe('Bearer pld_existing');
  });
});

describe('fetchList', () => {
  it('asks for the list by its code, carrying this device’s token so it can tell if it is the owner', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'abcdefghjk', isOwner: true }));

    expect(await fetchList('abcdefghjk')).toEqual({ id: 'abcdefghjk', isOwner: true });

    expect(requestedUrl()).toBe('/api/v1/lists/abcdefghjk');
    expect(headers().Authorization).toBe('Bearer pld_existing');
  });

  it('asks without a token, and gets none, for a visitor who has never used Plinth', async () => {
    localStorage.clear();
    fetchMock.mockResolvedValueOnce(json({ id: 'abcdefghjk', isOwner: false }));

    await fetchList('abcdefghjk');

    expect(headers()).not.toHaveProperty('Authorization');
    expect(localStorage.getItem('plinth-device-token')).toBeNull();
  });

  it('reads the list as a visitor, and forgets the token, when the server does not know it', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ error: 'Invalid or expired device token.' }, 401))
      .mockResolvedValueOnce(json({ id: 'abcdefghjk', isOwner: false }));

    expect(await fetchList('abcdefghjk')).toEqual({ id: 'abcdefghjk', isOwner: false });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(headers(1)).not.toHaveProperty('Authorization');
    expect(localStorage.getItem('plinth-device-token')).toBeNull();
  });

  it('says it was not found, with the status, for a list that is not there or not finished', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'List not found' }, 404));

    await expect(fetchList('abcdefghjk')).rejects.toMatchObject({ status: 404 });
  });

  it('encodes the code', async () => {
    fetchMock.mockResolvedValueOnce(json({}));

    await fetchList('a/b');

    expect(requestedUrl()).toBe('/api/v1/lists/a%2Fb');
  });

  it('can be cancelled', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );

    const pending = fetchList('abcdefghjk', controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
