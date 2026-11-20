import React, { useState } from 'react';
import { isRated } from '../../services/libraryRetention';
import { HistoryEntry } from '../../types/history';

const DISMISSED_KEY = 'plinth-crate-nudge-dismissed';

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
    // The note still goes away for this visit; it may be back on the next.
  }
}

interface SaveCrateNudgeProps {
  readonly history: readonly HistoryEntry[];
  readonly isSignedIn: boolean;
  /** True until it is known whether someone is signed in, so a signed-in person never sees this. */
  readonly isChecking: boolean;
  /** False when signing in is switched off, when offering it would lead nowhere. */
  readonly isSignInAvailable: boolean;
  /** Opens the way to signing in. */
  readonly onSignIn: () => void;
}

/**
 * Tells someone who isn't signed in that their crate lives in this browser alone. Only when it
 * holds something worth keeping: picks nobody has answered roll off by themselves, so a crate of
 * those isn't at risk. Asked once, and gone for good after "Not now".
 */
export function SaveCrateNudge({
  history,
  isSignedIn,
  isChecking,
  isSignInAvailable,
  onSignIn,
}: SaveCrateNudgeProps): React.ReactElement | null {
  const [isDismissed, setIsDismissed] = useState(wasDismissed);

  if (isChecking || isSignedIn || !isSignInAvailable || isDismissed || !history.some(isRated)) {
    return null;
  }

  return (
    <aside className="crate-nudge" role="note">
      <p className="crate-nudge-text">
        This crate only lives in this browser. If you clear your browser&apos;s data, it&apos;s
        gone. Sign in to keep it safe and have it on your other devices. You can still export a copy
        any time.
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
