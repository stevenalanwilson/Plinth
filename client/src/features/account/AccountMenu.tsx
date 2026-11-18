import React, { FormEvent, useState } from 'react';
import { ConfirmButton } from '../../components/ConfirmButton';
import { Account } from './useAccount';

interface AccountMenuProps {
  readonly account: Account | null;
  readonly isChecking: boolean;
  readonly onRequestLink: (email: string) => Promise<void>;
  readonly onSignOut: () => Promise<void>;
  readonly onDeleteAccount: () => Promise<void>;
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
        Signing in is optional. For now it gives you more picks a day. Your crate stays on this
        device.
      </p>
    </form>
  );
}

function SignedInPanel({
  account,
  onSignOut,
  onDeleteAccount,
}: {
  readonly account: Account;
  readonly onSignOut: () => Promise<void>;
  readonly onDeleteAccount: () => Promise<void>;
}): React.ReactElement {
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>): Promise<void> {
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(messageOf(failure));
    }
  }

  return (
    <div className="account-form">
      <p className="account-note">Signed in as {account.email}.</p>
      <div className="account-form-row">
        <button type="button" className="account-button" onClick={() => void run(onSignOut)}>
          Sign out
        </button>
        <ConfirmButton
          className="account-button account-button-danger"
          label="Delete account"
          confirmLabel="Tap again to delete"
          onConfirm={() => void run(onDeleteAccount)}
        />
      </div>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      <p className="account-note">
        Deleting removes your account and signs every device out of it. The crate on this device
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
              onSignOut={async () => {
                await onSignOut();
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
