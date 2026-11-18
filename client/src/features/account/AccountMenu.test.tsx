import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from './AccountMenu';

const onRequestLink = vi.fn<[string], Promise<void>>();
const onSignOut = vi.fn<[], Promise<void>>();
const onDeleteAccount = vi.fn<[], Promise<void>>();

function renderMenu(
  props: { account?: { email: string } | null; isChecking?: boolean } = {},
): void {
  render(
    <AccountMenu
      account={props.account ?? null}
      isChecking={props.isChecking ?? false}
      onRequestLink={onRequestLink}
      onSignOut={onSignOut}
      onDeleteAccount={onDeleteAccount}
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
    expect(screen.getByText(/gives you more picks a day/)).toBeInTheDocument();
    expect(screen.getByText(/crate stays on this device/)).toBeInTheDocument();
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

    expect(onSignOut).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
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

    expect(screen.getByText(/signs every device out of it/)).toBeInTheDocument();
    expect(screen.getByText(/crate on this device\s+stays/)).toBeInTheDocument();
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
