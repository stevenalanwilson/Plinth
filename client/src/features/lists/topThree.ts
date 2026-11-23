import { AlbumResponse } from '@shared/types';
import { HistoryEntry } from '../../types/history';

/** How many albums a top 3 holds. */
export const TOP_THREE_SIZE = 3;

/** An album as the builder holds it: enough to show it and to save it. */
export interface PickedAlbum {
  /** MusicBrainz release group ID: what a list is saved with. */
  readonly releaseGroupId: string;
  readonly artist: string;
  readonly album: string;
  readonly year: string | null;
}

/** Adds the album last, unless the list is full or already has it. */
export function addAlbum(albums: readonly PickedAlbum[], added: PickedAlbum): PickedAlbum[] {
  const isTaken = albums.some((album) => album.releaseGroupId === added.releaseGroupId);
  if (isTaken || albums.length >= TOP_THREE_SIZE) return [...albums];
  return [...albums, added];
}

/** Takes the album at this position out, closing the gap. */
export function removeAlbumAt(albums: readonly PickedAlbum[], index: number): PickedAlbum[] {
  if (!Number.isInteger(index) || index < 0 || index >= albums.length) return [...albums];
  return albums.filter((_album, position) => position !== index);
}

/** Moves the album at this position to this one, the albums between shifting along. */
export function moveAlbumTo(
  albums: readonly PickedAlbum[],
  from: number,
  to: number,
): PickedAlbum[] {
  const isInList = (index: number): boolean => index >= 0 && index < albums.length;
  if (from === to || !isInList(from) || !isInList(to)) return [...albums];

  const moved = [...albums];
  const [album] = moved.splice(from, 1);
  moved.splice(to, 0, album);
  return moved;
}

/** Moves the album one place up (-1) or down (1). The first can't go up, nor the last down. */
export function moveAlbum(
  albums: readonly PickedAlbum[],
  index: number,
  direction: -1 | 1,
): PickedAlbum[] {
  return moveAlbumTo(albums, index, index + direction);
}

/** Whether the albums, or their order, differ. Albums are told apart by their ID alone. */
export function hasChanged(before: readonly PickedAlbum[], after: readonly PickedAlbum[]): boolean {
  return (
    before.length !== after.length ||
    before.some((album, index) => album.releaseGroupId !== after[index].releaseGroupId)
  );
}

export function fromListAlbums(albums: readonly AlbumResponse[]): PickedAlbum[] {
  return albums.map(({ releaseGroupId, artist, album, year }) => ({
    releaseGroupId,
    artist,
    album,
    year,
  }));
}

/**
 * The albums in the crate that a list can hold: those MusicBrainz confirmed, since a list is
 * saved by MusicBrainz ID. Each is offered once, however many times it was picked.
 */
export function albumsInCrate(history: readonly HistoryEntry[]): PickedAlbum[] {
  const seen = new Set<string>();
  const albums: PickedAlbum[] = [];
  for (const { recommendation } of history) {
    const { releaseGroupId } = recommendation;
    if (!releaseGroupId || seen.has(releaseGroupId)) continue;
    seen.add(releaseGroupId);
    albums.push({
      releaseGroupId,
      artist: recommendation.artist,
      album: recommendation.album,
      year: recommendation.year || null,
    });
  }
  return albums;
}
