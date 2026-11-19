import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from './AccountMenu';
import { SyncStatus, UnsyncedCrateError } from './useLibrarySync';

const onRequestLink = vi.fn<[string], Promise<void>>();
const onSignOut = vi.fn<[{ discardUnsynced: boolean }], Promise<void>>();
const onDeleteAccount = vi.fn<[], Promise<void>>();

function renderMenu(
  props: {
    account?: { email: string } | null;
    isChecking?: boolean;
    status?: SyncStatus;
    hasUnsynced?: boolean;
  } = {},
): void {
  render(
    <AccountMenu
      account={props.account ?? null}
      isChecking={props.isChecking ?? false}
      onRequestLink={onRequestLink}
      onSignOut={onSignOut}
      onDeleteAccount={onDeleteAccount}
      sync={{ status: props.status ?? 'idle', hasUnsynced: props.hasUnsynced ?? false }}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  onRequestLink.mockResolvedValue(undefined);
  onSignOut.mockResolvedValue(undefined);
  onDeleteAccount.mockResolvedValue(undefined);
});

describe('AccountMenu signed out', () => {
  it('shows nothing until it is known whether someone is signed in', () => {
    renderMenu({ isChecking: true });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers to sign in, with the form out of the way until asked for', () => {
    renderMenu();

    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByLabelText('Email me a sign-in link')).not.toBeInTheDocument();
  });

  it('opens a form that says what signing in gives, honestly', async () => {
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByLabelText('Email me a sign-in link')).toBeInTheDocument();
    expect(screen.getByText(/saves your crate to your account/)).toBeInTheDocument();
    expect(screen.getByText(/more picks a day/)).toBeInTheDocument();
  });

  it('asks for a link for the address, without stray spaces', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await userEvent.type(screen.getByLabelText('Email me a sign-in link'), '  person@example.com ');
    await userEvent.click(screen.getByRole('button', { name: 'Send link' }));

    expect(onRequestLink).toHaveBeenCalledWith('person@example.com');
  });

  it('tells you to check your email, and how long the link lasts', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await userEvent.type(screen.getByLabelText('Email me a sign-in link'), 'person@example.com');

    await userEvent.click(screen.getByRole('button', { name: 'Send link' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'we sent a link to person@example.com. It works once, for 15 minutes.',
    );
  });

  it('disables the button while the link is being sent', async () => {
    onRequestLink.mockReturnValue(new Promise(() => {}));
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await userEvent.type(screen.getByLabelText('Email me a sign-in link'), 'person@example.com');

    await userEvent.click(screen.getByRole('button', { name: 'Send link' }));

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  });

  it('shows why a link could not be sent, and keeps the address to try again', async () => {
    onRequestLink.mockRejectedValue(new Error('Too many sign-in links.'));
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await userEvent.type(screen.getByLabelText('Email me a sign-in link'), 'person@example.com');

    await userEvent.click(screen.getByRole('button', { name: 'Send link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many sign-in links.');
    expect(screen.getByLabelText('Email me a sign-in link')).toHaveValue('person@example.com');
    expect(screen.getByRole('button', { name: 'Send link' })).toBeEnabled();
  });

  it('closes again when the button is tapped a second time', async () => {
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.queryByLabelText('Email me a sign-in link')).not.toBeInTheDocument();
  });
});

describe('AccountMenu signed in', () => {
  const account = { email: 'person@example.com' };

  it('shows who is signed in instead of offering to sign in', () => {
    renderMenu({ account });

    expect(screen.getByRole('button', { name: 'person@example.com' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('signs out, and closes', async () => {
    renderMenu({ account });
    await userEvent.click(screen.getByRole('button', { name: 'person@example.com' }));

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(onSignOut).toHaveBeenCalledWith({ discardUnsynced: false });
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('says the crate is saved when it is', async () => {
    renderMenu({ account });

    await userEvent.click(screen.getByRole('button', { name: 'person@example.com' }));

    expect(screen.getByRole('status')).toHaveTextContent('Your crate is saved to your account.');
  });

  it.each([
    ['is being saved', { status: 'syncing' as const }],
    ['has changes waiting', { hasUnsynced: true }],
  ])('says it is saving while the crate %s', async (_name, props) => {
    renderMenu({ account, ...props });

    await userEvent.click(screen.getByRole('button', { name: 'person@example.com' }));

    expect(screen.getByRole('status')).toHaveTextContent('Saving your crate…');
  });

  it('says so, as a problem, when saving failed', async () => {
    renderMenu({ account, status: 'failed', hasUnsynced: true });

    await userEvent.click(screen.getByRole('button', { name: 'person@example.com' }));

    expect(screen.getByRole('status')).toHaveTextContent(/Couldn't save your crate/);
    expect(screen.getByRole('status')).toHaveClass('account-error');
  });

  describe('signing out with changes that have not reached the account', () => {
    async function trySigningOut(): Promise<void> {
      onSignOut.mockRejectedValueOnce(new UnsyncedCrateError());
      renderMenu({ account, hasUnsynced: true, status: 'failed' });
      await userEvent.click(screen.getByRole('button', { name: 'person@example.com' }));
      await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    }

    it('warns what would be lost, and offers to stay signed in or go ahead', async () => {
      await trySigningOut();

      expect(await screen.findByRole('alert')).toHaveTextContent(/lost from this device/);
      expect(screen.getByRole('button', { name: 'Stay signed in' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign out anyway' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument();
    });

    it('goes back to the menu when staying signed in', async () => {
      await trySigningOut();

      await userEvent.click(await screen.findByRole('button', { name: 'Stay signed in' }));

      expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
      expect(onSignOut).toHaveBeenCalledTimes(1);
    });

    it('signs out and drops the changes when told to go ahead', async () => {
      await trySigningOut();

      await userEvent.click(await screen.findByRole('button', { name: 'Sign out anyway' }));

      expect(onSignOut).toHaveBeenLastCalledWith({ discardUnsynced: true });
    });
  });

  it('shows why signing out failed, and stays open', async () => {
    onSignOut.mockRejectedValue(new Error('Something went wrong signing out.'));
    renderMenu({ account });
    await userEvent.click(screen.getByRole('button', { name: 'person@example.com' }));

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong signing out.');
  });

  it('asks twice before deleting the account', async () => {
    renderMenu({ account });
    await userEvent.click(screen.getByRole('button', { name: 'person@example.com' }));

    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(onDeleteAccount).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Tap again to delete' }));

    expect(onDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it('says what deleting does, and what it leaves', async () => {
    renderMenu({ account });

    await userEvent.click(screen.getByRole('button', { name: 'person@example.com' }));

    expect(screen.getByText(/the crate saved with it/)).toBeInTheDocument();
    expect(screen.getByText(/crate on this device\s+stays/)).toBeInTheDocument();
    expect(screen.getByText(/Signing out takes the crate off this device/)).toBeInTheDocument();
  });

  it('shows why it failed, and stays open, when the account could not be deleted', async () => {
    onDeleteAccount.mockRejectedValue(new Error("Couldn't delete the account."));
    renderMenu({ account });
    await userEvent.click(screen.getByRole('button', { name: 'person@example.com' }));

    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tap again to delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't delete the account.");
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
