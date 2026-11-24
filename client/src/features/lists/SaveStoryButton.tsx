import React, { useRef, useState } from 'react';
import { fetchListStory } from '../../services/apiClient';
import { toFailure } from '../../services/failure';
import { NeedsAnotherTapError, savePicture } from '../../services/savePicture';

interface SaveStoryButtonProps {
  readonly list: { readonly id: string; readonly title: string };
}

type State = 'idle' | 'working' | 'done' | 'tap-again' | 'failed';

/** "My top 3 hip-hop albums" becomes "my-top-3-hip-hop-albums". */
function fileNameFor(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'my-list'}.jpg`;
}

/**
 * Saves the list as a tall picture for Instagram Stories and the like, where a link shows no
 * preview: through the share sheet on a phone, as a download elsewhere. Drawing it the first time
 * takes a few seconds.
 */
export function SaveStoryButton({ list }: SaveStoryButtonProps): React.ReactElement {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);
  // Kept once fetched, so a second tap after the share sheet wanted one has it at once.
  const picture = useRef<File | null>(null);

  async function handleClick(): Promise<void> {
    if (state === 'working') return;
    setState('working');
    setError(null);
    try {
      if (!picture.current) {
        const blob = await fetchListStory(list.id);
        picture.current = new File([blob], fileNameFor(list.title), { type: 'image/jpeg' });
      }
      const outcome = await savePicture(picture.current, list.title);
      setState(outcome === 'cancelled' ? 'idle' : 'done');
    } catch (failure) {
      if (failure instanceof NeedsAnotherTapError) {
        setState('tap-again');
        return;
      }
      setError(toFailure(failure, "Couldn't make the picture. Please try again.").message);
      setState('failed');
    }
  }

  const label =
    state === 'working'
      ? 'Making the picture…'
      : state === 'tap-again'
        ? 'Tap to send the picture'
        : state === 'done'
          ? 'Saved for Stories'
          : 'Save for Stories';

  return (
    <>
      <button
        type="button"
        className="crate-action"
        aria-busy={state === 'working'}
        disabled={state === 'working'}
        onClick={() => void handleClick()}
      >
        {label}
      </button>
      <span role="status" className="visually-hidden">
        {state === 'done' ? 'The picture is saved' : ''}
      </span>
      {error && (
        <p role="alert" className="top-three-note" data-tone="error">
          {error}
        </p>
      )}
    </>
  );
}
