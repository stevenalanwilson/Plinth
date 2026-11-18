import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../services/apiClient', () => ({
  fetchAccount: vi.fn(),
  requestSignInLink: vi.fn(),
  signOut: vi.fn(),
  deleteAccount: vi.fn(),
}));

import {
  deleteAccount as apiDeleteAccount,
  fetchAccount,
  requestSignInLink,
  signOut as apiSignOut,
} from '../../services/apiClient';
import { useAccount } from './useAccount';

const mockFetchAccount = vi.mocked(fetchAccount);
const mockSignOut = vi.mocked(apiSignOut);
const mockDelete = vi.mocked(apiDeleteAccount);

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchAccount.mockResolvedValue({ account: { email: 'person@example.com' } });
  mockSignOut.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
});

describe('useAccount', () => {
  it('is checking until the server has said who is signed in', async () => {
    const { result } = renderHook(() => useAccount());

    expect(result.current.isChecking).toBe(true);
    expect(result.current.account).toBeNull();
    await waitFor(() => expect(result.current.isChecking).toBe(false));
  });

  it('knows who is signed in', async () => {
    const { result } = renderHook(() => useAccount());

    await waitFor(() => expect(result.current.account).toEqual({ email: 'person@example.com' }));
  });

  it('is not signed in when the server says so', async () => {
    mockFetchAccount.mockResolvedValue({ account: null });

    const { result } = renderHook(() => useAccount());

    await waitFor(() => expect(result.current.isChecking).toBe(false));
    expect(result.current.account).toBeNull();
  });

  it('treats not being able to ask as not being signed in, rather than failing', async () => {
    mockFetchAccount.mockRejectedValue(new Error('Failed to fetch'));

    const { result } = renderHook(() => useAccount());

    await waitFor(() => expect(result.current.isChecking).toBe(false));
    expect(result.current.account).toBeNull();
  });

  it('does not set anything once it has been left', async () => {
    let resolve: (value: { account: { email: string } }) => void = () => {};
    mockFetchAccount.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { result, unmount } = renderHook(() => useAccount());

    unmount();
    resolve({ account: { email: 'person@example.com' } });

    expect(result.current.account).toBeNull();
  });

  it('signs out, and is then not signed in', async () => {
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.account).not.toBeNull());

    await act(() => result.current.signOut());

    expect(mockSignOut).toHaveBeenCalled();
    expect(result.current.account).toBeNull();
  });

  it('deletes the account, and is then not signed in', async () => {
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.account).not.toBeNull());

    await act(() => result.current.deleteAccount());

    expect(mockDelete).toHaveBeenCalled();
    expect(result.current.account).toBeNull();
  });

  it('stays signed in, and says why, when deleting fails', async () => {
    mockDelete.mockRejectedValue(new Error("Couldn't delete the account."));
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.account).not.toBeNull());

    await expect(act(() => result.current.deleteAccount())).rejects.toThrow(
      "Couldn't delete the account.",
    );

    expect(result.current.account).toEqual({ email: 'person@example.com' });
  });

  it('stays signed in when signing out fails', async () => {
    mockSignOut.mockRejectedValue(new Error('Offline'));
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.account).not.toBeNull());

    await expect(act(() => result.current.signOut())).rejects.toThrow('Offline');

    expect(result.current.account).not.toBeNull();
  });

  it('asks for a sign-in link through the API client', async () => {
    const { result } = renderHook(() => useAccount());

    expect(result.current.requestLink).toBe(requestSignInLink);
  });
});
