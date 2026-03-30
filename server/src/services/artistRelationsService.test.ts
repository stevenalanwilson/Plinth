import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchArtistRelations } from './artistRelationsService';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function artistSearchResponse(
  artists: Array<{ id: string; name: string; score?: number }>,
): Promise<{ ok: boolean; json: () => Promise<{ artists: typeof artists }> }> {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ artists }),
  });
}

function artistDetailResponse(
  relations: Array<Record<string, unknown>>,
): Promise<{ ok: boolean; json: () => Promise<{ relations: typeof relations }> }> {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ relations }),
  });
}

function recordingBrowseResponse(
  recordings: Array<Record<string, unknown>>,
): Promise<{ ok: boolean; json: () => Promise<{ recordings: typeof recordings }> }> {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ recordings }),
  });
}

const emptyRecordings = recordingBrowseResponse([]);

describe('fetchArtistRelations', () => {
  it('returns formatted relations on success', async () => {
    mockFetch
      .mockReturnValueOnce(artistSearchResponse([{ id: 'mbid-1', name: 'Burial', score: 100 }]))
      .mockReturnValueOnce(
        artistDetailResponse([
          {
            type: 'collaboration',
            direction: 'forward',
            artist: { id: 'mbid-2', name: 'Four Tet' },
          },
        ]),
      )
      .mockReturnValueOnce(emptyRecordings);

    const promise = fetchArtistRelations('Burial');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.relations).toEqual([{ name: 'Four Tet', type: 'Collaborator' }]);
  });

  it('filters out unsupported relationship types', async () => {
    mockFetch
      .mockReturnValueOnce(artistSearchResponse([{ id: 'mbid-1', name: 'Artist', score: 100 }]))
      .mockReturnValueOnce(
        artistDetailResponse([
          { type: 'conductor', direction: 'forward', artist: { id: 'x', name: 'Some Conductor' } },
          {
            type: 'member of band',
            direction: 'forward',
            artist: { id: 'y', name: 'Band Member' },
          },
        ]),
      )
      .mockReturnValueOnce(emptyRecordings);

    const promise = fetchArtistRelations('Artist');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].name).toBe('Band Member');
    expect(result.relations[0].type).toBe('Member');
  });

  it('deduplicates artist names across both sources', async () => {
    mockFetch
      .mockReturnValueOnce(artistSearchResponse([{ id: 'mbid-1', name: 'Artist', score: 100 }]))
      .mockReturnValueOnce(
        artistDetailResponse([
          {
            type: 'collaboration',
            direction: 'forward',
            artist: { id: 'x', name: 'Shared Artist' },
          },
        ]),
      )
      .mockReturnValueOnce(
        // Recording also credits Shared Artist — should not appear twice
        recordingBrowseResponse([
          {
            'artist-credit': [
              { artist: { id: 'x', name: 'Shared Artist' } },
              { artist: { id: 'z', name: 'New Artist' } },
            ],
          },
        ]),
      );

    const promise = fetchArtistRelations('Artist');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.relations).toHaveLength(2);
    expect(result.relations.map((r) => r.name)).toEqual(['Shared Artist', 'New Artist']);
  });

  it('caps results at 8 relations', async () => {
    const relations = Array.from({ length: 12 }, (_, i) => ({
      type: 'collaboration',
      direction: 'forward',
      artist: { id: `id-${i}`, name: `Artist ${i}` },
    }));

    mockFetch
      .mockReturnValueOnce(artistSearchResponse([{ id: 'mbid-1', name: 'Artist', score: 100 }]))
      .mockReturnValueOnce(artistDetailResponse(relations));

    const promise = fetchArtistRelations('Artist');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.relations).toHaveLength(8);
  });

  it('returns empty relations when MusicBrainz artist search returns no results', async () => {
    mockFetch.mockReturnValueOnce(artistSearchResponse([]));

    const promise = fetchArtistRelations('Unknown Artist');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.relations).toEqual([]);
  });

  it('returns empty relations when artist search request fails', async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }),
    );

    const promise = fetchArtistRelations('Artist');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.relations).toEqual([]);
  });

  it('returns empty relations when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const promise = fetchArtistRelations('Artist');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.relations).toEqual([]);
  });

  it('returns empty relations when best match score is below threshold', async () => {
    mockFetch.mockReturnValueOnce(
      artistSearchResponse([{ id: 'mbid-1', name: 'Artist', score: 50 }]),
    );

    const promise = fetchArtistRelations('Artist');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.relations).toEqual([]);
  });

  it('skips relations without an artist object', async () => {
    mockFetch
      .mockReturnValueOnce(artistSearchResponse([{ id: 'mbid-1', name: 'Artist', score: 100 }]))
      .mockReturnValueOnce(
        artistDetailResponse([
          { type: 'collaboration', direction: 'forward' }, // no artist field
          {
            type: 'collaboration',
            direction: 'forward',
            artist: { id: 'x', name: 'Valid Artist' },
          },
        ]),
      )
      .mockReturnValueOnce(emptyRecordings);

    const promise = fetchArtistRelations('Artist');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].name).toBe('Valid Artist');
  });

  it('uses recording collaborators when artist-rels returns nothing', async () => {
    mockFetch
      .mockReturnValueOnce(artistSearchResponse([{ id: 'mbid-1', name: 'Calexico', score: 100 }]))
      .mockReturnValueOnce(artistDetailResponse([]))
      .mockReturnValueOnce(
        recordingBrowseResponse([
          {
            'artist-credit': [
              { artist: { id: 'a', name: 'Calexico' } },
              { artist: { id: 'b', name: 'Iron & Wine' } },
            ],
          },
          {
            'artist-credit': [
              { artist: { id: 'a', name: 'Calexico' } },
              { artist: { id: 'c', name: 'Nick Cave' } },
            ],
          },
        ]),
      );

    const promise = fetchArtistRelations('Calexico');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.relations).toHaveLength(2);
    expect(result.relations[0]).toEqual({ name: 'Iron & Wine', type: 'Collaborator' });
    expect(result.relations[1]).toEqual({ name: 'Nick Cave', type: 'Collaborator' });
  });

  it('excludes the queried artist from recording collaborators', async () => {
    mockFetch
      .mockReturnValueOnce(artistSearchResponse([{ id: 'mbid-1', name: 'Artist', score: 100 }]))
      .mockReturnValueOnce(artistDetailResponse([]))
      .mockReturnValueOnce(
        recordingBrowseResponse([
          {
            'artist-credit': [
              { artist: { id: 'mbid-1', name: 'Artist' } },
              { artist: { id: 'x', name: 'Other Artist' } },
            ],
          },
        ]),
      );

    const promise = fetchArtistRelations('Artist');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].name).toBe('Other Artist');
  });
});
