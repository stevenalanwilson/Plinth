import React, { FormEvent, useState } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton';
import { Account } from './useAccount';
import { SyncStatus, UnsyncedCrateError } from './useLibrarySync';

interface AccountMenuProps {
  readonly account: Account | null;
  readonly isChecking: boolean;
  readonly onRequestLink: (email: string) => Promise<void>;
  /**
   * Signs out and takes the crate off this device. Rejects with UnsyncedCrateError, and does
   * nothing, if changes haven't reached the account, unless told to go ahead without them.
   */
  readonly onSignOut: (options: { readonly discardUnsynced: boolean }) => Promise<void>;
  readonly onDeleteAccount: () => Promise<void>;
  /** How saving the crate to the account is going. */
  readonly sync: { readonly status: SyncStatus; readonly hasUnsynced: boolean };
}

type LinkStatus =
  | { readonly state: 'idle' }
  | { readonly state: 'sending' }
  | { readonly state: 'sent'; readonly email: string };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function SignInForm({
  onRequestLink,
}: {
  readonly onRequestLink: (email: string) => Promise<void>;
}): React.ReactElement {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<LinkStatus>({ state: 'idle' });
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setStatus({ state: 'sending' });
    try {
      await onRequestLink(email.trim());
      setStatus({ state: 'sent', email: email.trim() });
    } catch (failure) {
      setStatus({ state: 'idle' });
      setError(messageOf(failure));
    }
  }

  if (status.state === 'sent') {
    return (
      <p className="account-note" role="status">
        Check your email: we sent a link to {status.email}. It works once, for 15 minutes.
      </p>
    );
  }

  return (
    <form className="account-form" onSubmit={(event) => void handleSubmit(event)}>
      <label className="account-label" htmlFor="account-email">
        Email me a sign-in link
      </label>
      <div className="account-form-row">
        <input
          id="account-email"
          className="account-input"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit" className="account-button" disabled={status.state === 'sending'}>
          {status.state === 'sending' ? 'Sending…' : 'Send link'}
        </button>
      </div>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      <p className="account-note">
        Signing in is optional. It saves your crate to your account, so it&apos;s there on every
        device you sign in on, and it gives you more picks a day.
      </p>
    </form>
  );
}

function syncNote(sync: AccountMenuProps['sync']): { text: string; isProblem: boolean } {
  if (sync.status === 'failed') {
    return {
      text: "Couldn't save your crate to your account just now. It will try again.",
      isProblem: true,
    };
  }
  if (sync.status === 'syncing' || sync.hasUnsynced) {
    return { text: 'Saving your crate…', isProblem: false };
  }
  return { text: 'Your crate is saved to your account.', isProblem: false };
}

function SignedInPanel({
  account,
  sync,
  onSignOut,
  onDeleteAccount,
}: {
  readonly account: Account;
  readonly sync: AccountMenuProps['sync'];
  readonly onSignOut: AccountMenuProps['onSignOut'];
  readonly onDeleteAccount: () => Promise<void>;
}): React.ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [isLosingChanges, setIsLosingChanges] = useState(false);

  async function run(action: () => Promise<void>): Promise<void> {
    setError(null);
    try {
      await action();
    } catch (failure) {
      if (failure instanceof UnsyncedCrateError) {
        setIsLosingChanges(true);
        return;
      }
      setError(messageOf(failure));
    }
  }

  const note = syncNote(sync);

  return (
    <div className="account-form">
      <p className="account-note">Signed in as {account.email}.</p>
      <p className={note.isProblem ? 'account-error' : 'account-note'} role="status">
        {note.text}
      </p>
      {isLosingChanges ? (
        <>
          <p className="account-error" role="alert">
            Some changes to your crate haven&apos;t reached your account yet. If you sign out now,
            they&apos;ll be lost from this device.
          </p>
          <div className="account-form-row">
            <button
              type="button"
              className="account-button"
              onClick={() => setIsLosingChanges(false)}
            >
              Stay signed in
            </button>
            <button
              type="button"
              className="account-button account-button-danger"
              onClick={() => void run(() => onSignOut({ discardUnsynced: true }))}
            >
              Sign out anyway
            </button>
          </div>
        </>
      ) : (
        <div className="account-form-row">
          <button
            type="button"
            className="account-button"
            onClick={() => void run(() => onSignOut({ discardUnsynced: false }))}
          >
            Sign out
          </button>
          <ConfirmButton
            className="account-button account-button-danger"
            label="Delete account"
            confirmLabel="Tap again to delete"
            onConfirm={() => void run(onDeleteAccount)}
          />
        </div>
      )}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      <p className="account-note">
        Signing out takes the crate off this device; it stays in your account. Deleting removes your
        account and the crate saved with it, and signs every device out. The crate on this device
        stays.
      </p>
    </div>
  );
}

/** The header's way in to signing in, and, once signed in, out and away. */
export function AccountMenu({
  account,
  isChecking,
  onRequestLink,
  onSignOut,
  onDeleteAccount,
  sync,
}: AccountMenuProps): React.ReactElement | null {
  const [isOpen, setIsOpen] = useState(false);

  // Not shown until it is known which to offer, so a signed-in person never sees "Sign in".
  if (isChecking) return null;

  return (
    <div className="account-menu">
      <button
        type="button"
        className="nav-tab account-toggle"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {account ? account.email : 'Sign in'}
      </button>
      {isOpen && (
        <div className="account-panel">
          {account ? (
            <SignedInPanel
              account={account}
              sync={sync}
              onSignOut={async (options) => {
                await onSignOut(options);
                setIsOpen(false);
              }}
              onDeleteAccount={async () => {
                await onDeleteAccount();
                setIsOpen(false);
              }}
            />
          ) : (
            <SignInForm onRequestLink={onRequestLink} />
          )}
        </div>
      )}
    </div>
  );
}
