import React, { useEffect, useRef, useState } from 'react';
import { genreOfQualifier, ListQualifier } from '@shared/types';
import { ConfirmButton } from '../../components/ConfirmButton';
import { SearchCombobox } from '../../components/SearchCombobox';
import { SaveStoryButton } from './SaveStoryButton';
import { ShareListButton } from './ShareListButton';
import { ShareListInvite, SignInOffer } from './ShareListInvite';
import { PickedAlbum, TOP_THREE_SIZE } from './topThree';
import { TopThreeSlot } from './TopThreeSlot';
import { useAlbumSearch } from './useAlbumSearch';
import { useTopThree } from './useTopThree';

interface TopThreePageProps {
  /** Which of the person's lists this is: all time, or a genre. */
  readonly qualifier: ListQualifier;
  /** Goes back to the person's lists. */
  readonly onBack: () => void;
  /** Albums in the person's crate, offered first when searching. */
  readonly crateAlbums: readonly PickedAlbum[];
  /** Whether and how to invite someone to sign in once they have shared their list. */
  readonly signIn: SignInOffer;
}

/** A button the focus should return to after an album moves, so a keyboard can keep going. */
interface PendingFocus {
  readonly albumId: string;
  readonly control: 'up' | 'down';
}

function BackToLists({ onBack }: { readonly onBack: () => void }): React.ReactElement {
  return (
    <button type="button" className="crate-action top-three-back" onClick={onBack}>
      ← Your lists
    </button>
  );
}

const SLOTS = Array.from({ length: TOP_THREE_SIZE }, (_unused, index) => index);

/** "albums of all time" or "hip-hop albums", to follow "Your three best". */
function aboutList(qualifier: ListQualifier): string {
  const genre = genreOfQualifier(qualifier);
  return genre ? `${genre.toLowerCase()} albums` : 'albums of all time';
}

/**
 * Where someone picks their three best albums of all time, or of a genre, in order. Albums come
 * from searching (the crate first) and can be moved or removed; nothing is saved until the person
 * says so.
 */
export function TopThreePage({
  qualifier,
  onBack,
  crateAlbums,
  signIn,
}: TopThreePageProps): React.ReactElement {
  const topThree = useTopThree(qualifier);
  const { albums, isFull, status } = topThree;
  const [query, setQuery] = useState('');
  const [hasShared, setHasShared] = useState(false);
  const search = useAlbumSearch({
    query,
    crateAlbums,
    excluded: albums.map((album) => album.releaseGroupId),
    isEnabled: status === 'ready' && !isFull,
  });
  const listRef = useRef<HTMLOListElement>(null);
  const dragFrom = useRef<number | null>(null);
  const pendingFocus = useRef<PendingFocus | null>(null);

  // After an album moves, its buttons are somewhere else: follow them, so a keyboard can keep
  // moving it. If it has reached an end, the button for that direction is off, so use the other.
  useEffect(() => {
    const pending = pendingFocus.current;
    pendingFocus.current = null;
    if (!pending) return;

    const slot = [...(listRef.current?.children ?? [])].find(
      (item) => item.getAttribute('data-album-id') === pending.albumId,
    );
    const other = pending.control === 'up' ? 'down' : 'up';
    const buttons = [pending.control, other].map((control) =>
      slot?.querySelector<HTMLButtonElement>(`[data-control="${control}"]`),
    );
    buttons.find((button) => button && !button.disabled)?.focus();
  }, [albums]);

  function move(index: number, direction: -1 | 1): void {
    pendingFocus.current = {
      albumId: albums[index].releaseGroupId,
      control: direction === -1 ? 'up' : 'down',
    };
    topThree.move(index, direction);
  }

  function drop(to: number): void {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from !== null) topThree.moveTo(from, to);
  }

  if (status === 'loading') {
    return (
      <section className="top-three" aria-label="My top 3">
        <BackToLists onBack={onBack} />
        <p role="status" className="top-three-note">
          Loading your list…
        </p>
      </section>
    );
  }

  if (status === 'failed') {
    return (
      <section className="top-three" aria-label="My top 3">
        <BackToLists onBack={onBack} />
        <p role="alert" className="top-three-note">
          We couldn&apos;t load your list.
        </p>
        <button type="button" className="crate-action" onClick={topThree.reload}>
          Try again
        </button>
      </section>
    );
  }

  const isSaving = topThree.saveState === 'saving';
  const canSave = topThree.isDirty && !isSaving;

  return (
    <section className="top-three" aria-label="My top 3">
      <BackToLists onBack={onBack} />
      <p className="top-three-intro">
        Your three best {aboutList(qualifier)}, in order. Add them by searching for the album or the
        artist.
      </p>

      <ol className="top-three-slots" role="list" aria-label="Your top 3" ref={listRef}>
        {SLOTS.map((index) => {
          const album = albums[index] ?? null;
          return (
            <TopThreeSlot
              key={album?.releaseGroupId ?? `empty-${index}`}
              rank={index + 1}
              album={album}
              canMoveUp={index > 0}
              canMoveDown={index < albums.length - 1}
              onMove={(direction) => move(index, direction)}
              onRemove={() => topThree.remove(index)}
              onDragStart={() => {
                dragFrom.current = index;
              }}
              onDrop={() => drop(index)}
            />
          );
        })}
      </ol>

      <div className="top-three-search">
        <span className="top-three-label">Add an album</span>
        <SearchCombobox
          value={query}
          onChange={setQuery}
          options={search.options}
          isSearching={search.isSearching}
          onChoose={(option) => {
            topThree.add(option.album);
            setQuery('');
          }}
          disabled={isFull}
          label="Search for an album"
          placeholder="Album or artist…"
          listLabel="Album results"
          noun="albums"
          maxLength={80}
          inputClassName="essentials-input"
        />
        {isFull && (
          <p className="top-three-note">Your list is full. Remove an album to add another.</p>
        )}
        {search.hasFailed && (
          <p className="top-three-note" data-tone="warning">
            Search isn&apos;t available right now. Albums in your crate can still be added.
          </p>
        )}
      </div>

      <div className="top-three-actions">
        <button
          type="button"
          className="app-cta-button top-three-save"
          disabled={!canSave}
          onClick={() => void topThree.save()}
        >
          {isSaving ? 'Saving…' : 'Save my top 3'}
        </button>
        <p className="top-three-count">
          {albums.length} of {TOP_THREE_SIZE} chosen
        </p>
        {topThree.saveState === 'saved' && (
          <p className="top-three-saved" aria-live="polite">
            Saved.
          </p>
        )}
        {topThree.shareable && (
          <>
            <ShareListButton
              list={topThree.shareable}
              variant="text"
              label="Share my top 3"
              onShare={() => setHasShared(true)}
            />
            <SaveStoryButton list={topThree.shareable} />
            <a href={`/list/${encodeURIComponent(topThree.shareable.id)}`} className="crate-action">
              View your page
            </a>
          </>
        )}
        {isFull && !topThree.shareable && (
          <p className="top-three-count">Save your list to share it.</p>
        )}
        {topThree.hasSavedList && (
          <ConfirmButton
            label="Delete my top 3"
            confirmLabel="Tap again to delete"
            onConfirm={() => void topThree.discard()}
            className="crate-action"
          />
        )}
      </div>

      <ShareListInvite hasShared={hasShared} {...signIn} />

      {topThree.saveError && (
        <p role="alert" className="top-three-note" data-tone="error">
          {topThree.saveError}
        </p>
      )}
    </section>
  );
}
