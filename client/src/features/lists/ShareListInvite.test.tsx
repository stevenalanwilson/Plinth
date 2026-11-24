import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareListInvite } from './ShareListInvite';

const onSignIn = vi.fn();

interface Overrides {
  hasShared?: boolean;
  isSignedIn?: boolean;
  isChecking?: boolean;
  isSignInAvailable?: boolean;
}

function renderInvite(overrides: Overrides = {}): ReturnType<typeof render> {
  return render(
    <ShareListInvite
      hasShared
      isSignedIn={false}
      isChecking={false}
      isSignInAvailable
      onSignIn={onSignIn}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('ShareListInvite', () => {
  it('invites someone who is not signed in, once they have shared, to sign in so the list is kept', () => {
    renderInvite();

    expect(screen.getByRole('note')).toHaveTextContent('Your top 3 is shared');
    expect(screen.getByRole('note')).toHaveTextContent("won't be able to change it");
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  it('says nothing about the weekly email, which is not offered yet', () => {
    renderInvite();

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('note').textContent).not.toMatch(/email|newsletter|weekly/i);
  });

  it('does not appear before they have shared, so it never gets in the way of sharing', () => {
    renderInvite({ hasShared: false });

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it.each([
    ['signed in', { isSignedIn: true }],
    ['still checking whether they are signed in', { isChecking: true }],
    ['signing in is switched off', { isSignInAvailable: false }],
  ])('does not appear when %s', (_name, overrides) => {
    renderInvite(overrides);

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('opens the way to signing in', async () => {
    renderInvite();

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('goes away on Not now, and stays away on later visits', async () => {
    const { unmount } = renderInvite();

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    unmount();
    renderInvite();

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('still goes away for this visit when storage refuses to keep the answer', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    renderInvite();

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('appears when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    renderInvite();

    expect(screen.getByRole('note')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
