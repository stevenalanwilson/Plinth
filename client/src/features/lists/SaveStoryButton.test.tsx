import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  fetchListStory: vi.fn(),
}));
vi.mock('../../services/savePicture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/savePicture')>()),
  savePicture: vi.fn(),
}));

import { ApiError, fetchListStory } from '../../services/apiClient';
import { NeedsAnotherTapError, savePicture } from '../../services/savePicture';
import { SaveStoryButton } from './SaveStoryButton';

const mockFetchStory = vi.mocked(fetchListStory);
const mockSave = vi.mocked(savePicture);
const LIST = { id: 'abcdefghjk', title: 'My top 3 hip-hop albums' };
const BUTTON = { name: 'Save for Stories' };

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchStory.mockResolvedValue(new Blob(['picture'], { type: 'image/jpeg' }));
  mockSave.mockResolvedValue('saved');
});

describe('SaveStoryButton', () => {
  it('offers to save the list for Stories', () => {
    render(<SaveStoryButton list={LIST} />);

    expect(screen.getByRole('button', BUTTON)).toBeEnabled();
  });

  it('fetches the list’s picture and saves it as a file named for the list', async () => {
    render(<SaveStoryButton list={LIST} />);

    await userEvent.click(screen.getByRole('button', BUTTON));

    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockFetchStory).toHaveBeenCalledWith('abcdefghjk');
    const [file, title] = mockSave.mock.calls[0];
    expect(file.name).toBe('my-top-3-hip-hop-albums.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(title).toBe('My top 3 hip-hop albums');
    expect(await screen.findByRole('button', { name: 'Saved for Stories' })).toBeEnabled();
  });

  it('is busy, and cannot be tapped again, while the picture is being made', async () => {
    let finish: (blob: Blob) => void = () => undefined;
    mockFetchStory.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<SaveStoryButton list={LIST} />);

    await userEvent.click(screen.getByRole('button', BUTTON));

    const busy = screen.getByRole('button', { name: 'Making the picture…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    finish(new Blob(['picture']));
    await screen.findByRole('button', { name: 'Saved for Stories' });
  });

  it('goes back to the start when the person closes the share sheet', async () => {
    mockSave.mockResolvedValue('cancelled');
    render(<SaveStoryButton list={LIST} />);

    await userEvent.click(screen.getByRole('button', BUTTON));

    expect(await screen.findByRole('button', BUTTON)).toBeEnabled();
  });

  it('says what went wrong, and lets the person try again', async () => {
    mockFetchStory.mockRejectedValueOnce(new ApiError("Couldn't make the picture.", 502));
    render(<SaveStoryButton list={LIST} />);

    await userEvent.click(screen.getByRole('button', BUTTON));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't make the picture.");
    await userEvent.click(screen.getByRole('button', BUTTON));
    await screen.findByRole('button', { name: 'Saved for Stories' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks for another tap when the share sheet wants a fresher one, and then shares the picture it already has', async () => {
    mockSave.mockRejectedValueOnce(new NeedsAnotherTapError());
    render(<SaveStoryButton list={LIST} />);

    await userEvent.click(screen.getByRole('button', BUTTON));
    await userEvent.click(await screen.findByRole('button', { name: 'Tap to send the picture' }));

    await screen.findByRole('button', { name: 'Saved for Stories' });
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(mockFetchStory).toHaveBeenCalledTimes(1);
  });
});
