import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ListResponse } from '@shared/types';

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  fetchList: vi.fn(),
}));

import { ApiError, fetchList } from '../../services/apiClient';
import { useList } from './useList';

const mockFetchList = vi.mocked(fetchList);

const LIST: ListResponse = {
  id: 'abcdefghjk',
  kind: 'top',
  qualifier: 'all-time',
  size: 3,
  title: 'My top 3 albums of all time',
  albums: [],
  updatedAt: '2026-11-24T12:00:00.000Z',
  isOwner: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useList', () => {
  it('is loading, then ready with the list', async () => {
    mockFetchList.mockResolvedValue(LIST);

    const { result } = renderHook(() => useList('abcdefghjk'));
    expect(result.current.state).toEqual({ status: 'loading' });

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(result.current.state).toEqual({ status: 'ready', list: LIST });
    expect(mockFetchList).toHaveBeenCalledWith('abcdefghjk', expect.any(AbortSignal));
  });

  it('is not found when the server says there is no such list', async () => {
    mockFetchList.mockRejectedValue(new ApiError('List not found', 404));

    const { result } = renderHook(() => useList('abcdefghjk'));

    await waitFor(() => expect(result.current.state).toEqual({ status: 'not-found' }));
  });

  it('says what went wrong for any other failure, and can try again', async () => {
    mockFetchList.mockRejectedValueOnce(new Error('network down')).mockResolvedValue(LIST);
    const { result } = renderHook(() => useList('abcdefghjk'));
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'error', message: 'network down' }),
    );

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
  });

  it('shows nothing from a list it has since left', async () => {
    let finishFirst: (list: ListResponse) => void = () => undefined;
    mockFetchList
      .mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce({ ...LIST, id: 'second0000' });
    const { result, rerender } = renderHook(({ id }) => useList(id), {
      initialProps: { id: 'abcdefghjk' },
    });

    rerender({ id: 'second0000' });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    await act(async () => finishFirst(LIST));

    expect(result.current.state).toEqual({
      status: 'ready',
      list: { ...LIST, id: 'second0000' },
    });
  });
});
