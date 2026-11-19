import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryEntry } from '../../types/history';
import { FeedbackStatus } from '../../types/feedback';
import { SaveCrateNudge } from './SaveCrateNudge';

const onSignIn = vi.fn();

function entry(album: string, status?: FeedbackStatus | null): HistoryEntry {
  return {
    id: `id-${album}`,
    recommendation: { artist: 'Can', album, year: '1971', reason: 'A great fit.' },
    artworkResponse: { artworkUrl: null, year: '1971', appleMusicUrl: null },
    createdAt: new Date().toISOString(),
    ...(status === undefined ? {} : { feedback: { status, at: new Date().toISOString() } }),
  };
}

function renderNudge(
  props: {
    history?: HistoryEntry[];
    isSignedIn?: boolean;
    isChecking?: boolean;
    isSignInAvailable?: boolean;
  } = {},
): void {
  render(
    <SaveCrateNudge
      history={props.history ?? [entry('A', 'own')]}
      isSignedIn={props.isSignedIn ?? false}
      isChecking={props.isChecking ?? false}
      isSignInAvailable={props.isSignInAvailable ?? true}
      onSignIn={onSignIn}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('SaveCrateNudge', () => {
  it('says the crate only lives in this browser, and offers to sign in or not now', () => {
    renderNudge();

    expect(screen.getByRole('note')).toHaveTextContent(/only lives in this browser/);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  it('says what signing in would give, and what is at risk', () => {
    renderNudge();

    expect(screen.getByRole('note')).toHaveTextContent(/clear your browser/i);
    expect(screen.getByRole('note')).toHaveTextContent(/other devices/);
  });

  it('opens the sign-in menu when asked to sign in', async () => {
    renderNudge();

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('goes away when told not now, and stays away on a later visit', async () => {
    const { unmount } = render(
      <SaveCrateNudge
        history={[entry('A', 'own')]}
        isSignedIn={false}
        isChecking={false}
        isSignInAvailable
        onSignIn={onSignIn}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    unmount();
    renderNudge();

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('is not shown to someone who is signed in', () => {
    renderNudge({ isSignedIn: true });

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('is not shown when signing in is switched off, since it would offer something that fails', () => {
    renderNudge({ isSignInAvailable: false });

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('is not shown until it is known whether someone is signed in', () => {
    renderNudge({ isChecking: true });

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('is not shown for a crate with nothing in it worth keeping', () => {
    renderNudge({ history: [] });

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('is not shown when no album has been answered, since picks nobody answered roll off anyway', () => {
    renderNudge({ history: [entry('A'), entry('B')] });

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('is not shown when the only answers were taken back', () => {
    renderNudge({ history: [entry('A', null)] });

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('is shown for any kind of answer', () => {
    renderNudge({ history: [entry('A', 'not-for-me')] });

    expect(screen.getByRole('note')).toBeInTheDocument();
  });

  it('still goes away for this visit when the browser will not keep the dismissal', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    renderNudge();

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    setItem.mockRestore();
  });
});
