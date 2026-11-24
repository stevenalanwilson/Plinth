import React, { useState } from 'react';

const DISMISSED_KEY = 'plinth-list-invite-dismissed';

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // The invite still goes away for this visit; it may be back on the next.
  }
}

export interface ShareListInviteProps {
  /** True once they have tapped Share: it is never shown before, so it can't get in the way. */
  readonly hasShared: boolean;
  readonly isSignedIn: boolean;
  /** True until it is known whether someone is signed in, so a signed-in person never sees this. */
  readonly isChecking: boolean;
  /** False when signing in is switched off, when offering it would lead nowhere. */
  readonly isSignInAvailable: boolean;
  /** Opens the way to signing in. */
  readonly onSignIn: () => void;
}

/**
 * Invites someone who isn't signed in to sign in, once they have shared their list. It lives with
 * this browser until they do: lose the browser's data and it can no longer be changed or deleted,
 * though the link carries on working. It comes after sharing and never before or instead of it,
 * and is asked once: gone for good after "Not now".
 */
export function ShareListInvite({
  hasShared,
  isSignedIn,
  isChecking,
  isSignInAvailable,
  onSignIn,
}: ShareListInviteProps): React.ReactElement | null {
  const [isDismissed, setIsDismissed] = useState(wasDismissed);

  if (!hasShared || isChecking || isSignedIn || !isSignInAvailable || isDismissed) return null;

  return (
    <aside className="crate-nudge" role="note">
      <p className="crate-nudge-text">
        Your top 3 is shared. It&apos;s kept with this browser for now: if you clear your
        browser&apos;s data you won&apos;t be able to change it, though the link will carry on
        working. Sign in to keep hold of it, on any device.
      </p>
      <div className="crate-nudge-actions">
        <button type="button" className="account-button" onClick={onSignIn}>
          Sign in
        </button>
        <button
          type="button"
          className="crate-action"
          onClick={() => {
            rememberDismissed();
            setIsDismissed(true);
          }}
        >
          Not now
        </button>
      </div>
    </aside>
  );
}

/** What the invite needs to know about signing in, apart from whether the list was shared. */
export type SignInOffer = Omit<ShareListInviteProps, 'hasShared'>;
