import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../services/apiClient', () => ({ verifySignIn: vi.fn() }));

import { verifySignIn } from '../../services/apiClient';
import { tokenFromHash, useSignInLink } from './useSignInLink';

const mockVerify = vi.mocked(verifySignIn);

function openAt(path: string): void {
  window.history.replaceState(null, '', path);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerify.mockResolvedValue({ account: { email: 'person@example.com' } });
});

afterEach(() => {
  openAt('/');
});

describe('tokenFromHash', () => {
  it('reads the token from the part after the #', () => {
    expect(tokenFromHash('#token=pls_abc-123_X')).toBe('pls_abc-123_X');
  });

  it.each(['', '#', '#other=1', '#token='])('finds none in %j', (hash) => {
    expect(tokenFromHash(hash)).toBeNull();
  });
});

describe('useSignInLink', () => {
  it('is ready to sign in when the address has a token', () => {
    openAt('/signin#token=pls_abc');

    const { result } = renderHook(() => useSignInLink());

    expect(result.current.state).toEqual({ status: 'ready' });
  });

  it('says the link is incomplete when there is no token', () => {
    openAt('/signin');

    const { result } = renderHook(() => useSignInLink());

    expect(result.current.state).toEqual({ status: 'missing' });
  });

  it('removes the token from the address, so it is not left in history', async () => {
    openAt('/signin#token=pls_abc');

    renderHook(() => useSignInLink());

    await waitFor(() => expect(window.location.hash).toBe(''));
    expect(window.location.pathname).toBe('/signin');
  });

  it('still signs in after the address has been cleaned up', async () => {
    openAt('/signin#token=pls_abc');
    const { result } = renderHook(() => useSignInLink());
    await waitFor(() => expect(window.location.hash).toBe(''));

    await act(() => result.current.signIn());

    expect(mockVerify).toHaveBeenCalledWith('pls_abc');
  });

  it('does not use the link up just by opening the page', () => {
    openAt('/signin#token=pls_abc');

    renderHook(() => useSignInLink());

    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('signs in when asked, and says who', async () => {
    openAt('/signin#token=pls_abc');
    const { result } = renderHook(() => useSignInLink());

    await act(() => result.current.signIn());

    expect(result.current.state).toEqual({ status: 'done', email: 'person@example.com' });
  });

  it('shows the server’s reason when the link is no good', async () => {
    mockVerify.mockRejectedValue(new Error('That link has expired or has already been used.'));
    openAt('/signin#token=pls_abc');
    const { result } = renderHook(() => useSignInLink());

    await act(() => result.current.signIn());

    expect(result.current.state).toEqual({
      status: 'failed',
      message: 'That link has expired or has already been used.',
    });
  });

  it('reports a sign-in that returns no account as a failure', async () => {
    mockVerify.mockResolvedValue({ account: null });
    openAt('/signin#token=pls_abc');
    const { result } = renderHook(() => useSignInLink());

    await act(() => result.current.signIn());

    expect(result.current.state.status).toBe('failed');
  });

  it('shows that it is signing in while it waits', async () => {
    mockVerify.mockReturnValue(new Promise(() => {}));
    openAt('/signin#token=pls_abc');
    const { result } = renderHook(() => useSignInLink());

    act(() => {
      void result.current.signIn();
    });

    expect(result.current.state).toEqual({ status: 'signing-in' });
  });

  it('does nothing when there is no token to sign in with', async () => {
    openAt('/signin');
    const { result } = renderHook(() => useSignInLink());

    await act(() => result.current.signIn());

    expect(mockVerify).not.toHaveBeenCalled();
  });
});
