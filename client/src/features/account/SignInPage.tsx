import React from 'react';
import { Link } from 'react-router-dom';
import { useSignInLink } from './useSignInLink';

/** Where the link in a sign-in email leads. */
export function SignInPage(): React.ReactElement {
  const { state, signIn } = useSignInLink();

  return (
    <main className="album-page">
      <header className="album-page-header">
        <Link to="/" className="album-page-wordmark">
          Plinth
        </Link>
      </header>

      <div className="account-card">
        {state.status === 'missing' && (
          <>
            <h2 className="account-card-title">This link is incomplete</h2>
            <p className="account-card-text">
              Open the whole link from your email, or ask for a new one from Plinth.
            </p>
            <Link to="/" className="album-page-cta-link">
              Go to Plinth
            </Link>
          </>
        )}

        {(state.status === 'ready' || state.status === 'signing-in') && (
          <>
            <h2 className="account-card-title">Sign in to Plinth</h2>
            <p className="account-card-text">You asked for a link to sign in on this browser.</p>
            <button
              type="button"
              className="album-page-cta-button"
              onClick={() => void signIn()}
              disabled={state.status === 'signing-in'}
            >
              {state.status === 'signing-in' ? 'Signing in…' : 'Sign in'}
            </button>
          </>
        )}

        {state.status === 'done' && (
          <>
            <h2 className="account-card-title">You&apos;re signed in</h2>
            <p className="account-card-text" role="status">
              Signed in as {state.email}.
            </p>
            <Link to="/" className="album-page-cta-link">
              Go to Plinth
            </Link>
          </>
        )}

        {state.status === 'failed' && (
          <>
            <h2 className="account-card-title">Couldn&apos;t sign you in</h2>
            <p className="account-card-text" role="alert">
              {state.message}
            </p>
            <Link to="/" className="album-page-cta-link">
              Go to Plinth
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
