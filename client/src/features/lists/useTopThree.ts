import { useCallback, useEffect, useState } from 'react';
import { ListResponse } from '@shared/types';
import { createList, deleteList, fetchOwnLists, replaceList } from '../../services/apiClient';
import { toFailure } from '../../services/failure';
import {
  addAlbum,
  fromListAlbums,
  hasChanged,
  moveAlbum,
  moveAlbumTo,
  PickedAlbum,
  removeAlbumAt,
  TOP_THREE_SIZE,
} from './topThree';

export type TopThreeStatus = 'loading' | 'ready' | 'failed';
export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

interface SavedList {
  readonly id: string;
  readonly albums: readonly PickedAlbum[];
}

export interface TopThree {
  /** Loading the saved list; ready to edit; or the saved list couldn't be loaded. */
  readonly status: TopThreeStatus;
  readonly albums: readonly PickedAlbum[];
  readonly isFull: boolean;
  /** True when the albums, or their order, differ from what is saved. */
  readonly isDirty: boolean;
  readonly hasSavedList: boolean;
  readonly saveState: SaveState;
  /** Why the last save or delete failed. */
  readonly saveError: string | null;
  readonly add: (album: PickedAlbum) => void;
  readonly remove: (index: number) => void;
  readonly move: (index: number, direction: -1 | 1) => void;
  readonly moveTo: (from: number, to: number) => void;
  readonly save: () => Promise<void>;
  /** Deletes the saved list, if there is one, and empties the builder. */
  readonly discard: () => Promise<void>;
  /** Tries again after the saved list couldn't be loaded. */
  readonly reload: () => void;
}

function toSaved(list: ListResponse): SavedList {
  return { id: list.id, albums: fromListAlbums(list.albums) };
}

/**
 * The person's top 3 albums of all time: what is saved on the server, and the changes being made
 * to it. Nothing is saved until asked, so a list can be built over several visits.
 */
export function useTopThree(): TopThree {
  const [status, setStatus] = useState<TopThreeStatus>('loading');
  const [albums, setAlbums] = useState<readonly PickedAlbum[]>([]);
  const [saved, setSaved] = useState<SavedList | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    fetchOwnLists(controller.signal)
      .then(({ lists }) => {
        const list = lists.find((l) => l.kind === 'top' && l.qualifier === 'all-time');
        const found = list ? toSaved(list) : null;
        setSaved(found);
        setAlbums(found?.albums ?? []);
        setStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('failed');
      });
    return () => controller.abort();
  }, [attempt]);

  const edit = useCallback((change: (current: readonly PickedAlbum[]) => PickedAlbum[]) => {
    setAlbums(change);
    // What was said about the last save no longer describes the list on screen.
    setSaveState('idle');
    setSaveError(null);
  }, []);

  const isDirty = hasChanged(saved?.albums ?? [], albums);

  const save = useCallback(async (): Promise<void> => {
    if (saveState === 'saving') return;
    if (saved === null && albums.length === 0) return;

    setSaveState('saving');
    setSaveError(null);
    const releaseGroupIds = albums.map((album) => album.releaseGroupId);
    try {
      const list = saved
        ? await replaceList(saved.id, releaseGroupIds)
        : await createList({ kind: 'top', qualifier: 'all-time', releaseGroupIds });
      const now = toSaved(list);
      setSaved(now);
      setAlbums(now.albums);
      setSaveState('saved');
    } catch (error) {
      setSaveError(toFailure(error, "Couldn't save your list. Please try again.").message);
      setSaveState('failed');
    }
  }, [albums, saved, saveState]);

  const discard = useCallback(async (): Promise<void> => {
    setSaveError(null);
    if (saved) {
      try {
        await deleteList(saved.id);
      } catch (error) {
        setSaveError(toFailure(error, "Couldn't delete your list. Please try again.").message);
        return;
      }
    }
    setSaved(null);
    setAlbums([]);
    setSaveState('idle');
  }, [saved]);

  return {
    status,
    albums,
    isFull: albums.length >= TOP_THREE_SIZE,
    isDirty,
    hasSavedList: saved !== null,
    saveState,
    saveError,
    add: (album) => edit((current) => addAlbum(current, album)),
    remove: (index) => edit((current) => removeAlbumAt(current, index)),
    move: (index, direction) => edit((current) => moveAlbum(current, index, direction)),
    moveTo: (from, to) => edit((current) => moveAlbumTo(current, from, to)),
    save,
    discard,
    reload: () => setAttempt((count) => count + 1),
  };
}
