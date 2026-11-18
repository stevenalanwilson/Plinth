import { useCallback, useEffect, useState } from 'react';
import { verifySignIn } from '../../services/apiClient';

export type SignInLinkState =
  | { readonly status: 'missing' }
  | { readonly status: 'ready' }
  | { readonly status: 'signing-in' }
  | { readonly status: 'done'; readonly email: string }
  | { readonly status: 'failed'; readonly message: string };

interface UseSignInLinkReturn {
  readonly state: SignInLinkState;
  readonly signIn: () => Promise<void>;
}

/** The token in a link like /signin#token=…, or null if the address has none. */
export function tokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  return token ? token : null;
}

/**
 * Signing in from the link in an email. The token is read from the address and then removed from
 * it, so it isn't left in the browser's history or in a screenshot. Opening the page doesn't use
 * the link up: mail programs and link scanners open links to look at them, so that waits for a
 * tap on the button.
 */
export function useSignInLink(): UseSignInLinkReturn {
  // Read, not taken: React may run this twice, and the address is cleaned up in an effect.
  const [token] = useState(() => tokenFromHash(window.location.hash));
  const [state, setState] = useState<SignInLinkState>(
    token ? { status: 'ready' } : { status: 'missing' },
  );

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const signIn = useCallback(async (): Promise<void> => {
    if (!token) return;
    setState({ status: 'signing-in' });
    try {
      const { account } = await verifySignIn(token);
      setState(
        account
          ? { status: 'done', email: account.email }
          : { status: 'failed', message: 'Something went wrong signing in. Please try again.' },
      );
    } catch (error) {
      setState({
        status: 'failed',
        message:
          error instanceof Error
            ? error.message
            : 'Something went wrong signing in. Please try again.',
      });
    }
  }, [token]);

  return { state, signIn };
}
