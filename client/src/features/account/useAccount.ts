import { useCallback, useEffect, useState } from 'react';
import {
  deleteAccount as apiDeleteAccount,
  fetchAccount,
  requestSignInLink,
  signOut as apiSignOut,
} from '../../services/apiClient';

export interface Account {
  readonly email: string;
}

interface UseAccountReturn {
  /** Who this browser is signed in as, or null while it is anonymous (or not yet known). */
  readonly account: Account | null;
  /** True until the first answer, so the menu doesn't offer to sign in someone who is. */
  readonly isChecking: boolean;
  /** False only when the server says signing in is switched off. Not knowing counts as on. */
  readonly isSignInAvailable: boolean;
  /** Emails a sign-in link. Rejects with a message fit to show. */
  readonly requestLink: (email: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
  /** Asks again who this browser is signed in as, for when something suggests it has changed. */
  readonly refresh: () => Promise<void>;
  /** Deletes the account. Rejects with a message fit to show. */
  readonly deleteAccount: () => Promise<void>;
}

export function useAccount(): UseAccountReturn {
  const [account, setAccount] = useState<Account | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isSignInAvailable, setIsSignInAvailable] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchAccount(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setAccount(result.account);
        setIsSignInAvailable(result.signInAvailable !== false);
      })
      // Not knowing is the same as not being signed in: the page still works.
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setIsChecking(false);
      });
    return () => controller.abort();
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const result = await fetchAccount();
      setAccount(result.account);
      setIsSignInAvailable(result.signInAvailable !== false);
    } catch {
      // Not knowing leaves things as they are.
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await apiSignOut();
    setAccount(null);
  }, []);

  const deleteAccount = useCallback(async (): Promise<void> => {
    await apiDeleteAccount();
    setAccount(null);
  }, []);

  return {
    account,
    isChecking,
    isSignInAvailable,
    requestLink: requestSignInLink,
    signOut,
    refresh,
    deleteAccount,
  };
}
