import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  noteListShared: vi.fn(),
}));

import { noteListShared } from '../../services/apiClient';
import { ShareListButton } from './ShareListButton';

const writeText = vi.fn();
const nativeShare = vi.fn();

const LIST = {
  id: 'abcdefghjk',
  title: 'My top 3 albums of all time',
  albums: [
    { album: 'Nevermind', artist: 'Nirvana' },
    { album: 'Abbey Road', artist: 'The Beatles' },
    { album: 'Kind of Blue', artist: 'Miles Davis' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  writeText.mockResolvedValue(undefined);
  nativeShare.mockResolvedValue(undefined);
  window.prompt = vi.fn();
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

async function tap(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

describe('ShareListButton as an icon', () => {
  it('is a square Share button, named for screen readers', () => {
    render(<ShareListButton list={LIST} variant="icon" />);

    const button = screen.getByRole('button', { name: 'Share' });
    expect(button).toHaveClass('icon-action');
    expect(button).toHaveAttribute('title', 'Share');
  });

  it('copies the list’s link on this site and confirms it', async () => {
    render(<ShareListButton list={LIST} variant="icon" />);

    await tap('Share');

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/list/abcdefghjk`);
    expect(screen.getByRole('button', { name: 'Link copied' })).toHaveAttribute(
      'data-copied',
      'true',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Link copied');
  });
});

describe('ShareListButton as a labelled button', () => {
  it('shows its label, then says the link was copied', async () => {
    render(<ShareListButton list={LIST} variant="text" label="Share my top 3" />);

    await tap('Share my top 3');

    expect(screen.getByRole('button', { name: 'Link copied' })).toHaveTextContent('Link copied');
  });

  it('can be switched off', () => {
    render(<ShareListButton list={LIST} variant="text" label="Share my top 3" disabled />);

    expect(screen.getByRole('button', { name: 'Share my top 3' })).toBeDisabled();
  });
});

describe('sharing a list', () => {
  it('tells the server, and asks for the picture, with the list’s code', async () => {
    render(<ShareListButton list={LIST} variant="icon" />);

    await tap('Share');

    expect(noteListShared).toHaveBeenCalledWith('abcdefghjk');
  });

  it('lets the page know, so it can offer to sign in', async () => {
    const onShare = vi.fn();
    render(<ShareListButton list={LIST} variant="icon" onShare={onShare} />);

    await tap('Share');

    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it('shares even if telling the server goes wrong, which must never get in the way', async () => {
    vi.mocked(noteListShared).mockImplementation(() => {
      throw new Error('storage is blocked');
    });
    render(<ShareListButton list={LIST} variant="icon" />);

    await tap('Share');

    expect(writeText).toHaveBeenCalled();
  });

  it('uses the phone’s share sheet, with the title, the albums and the link', async () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    Object.defineProperty(navigator, 'share', { value: nativeShare, configurable: true });
    render(<ShareListButton list={LIST} variant="icon" />);

    await tap('Share');

    expect(nativeShare).toHaveBeenCalledWith({
      title: 'My top 3 albums of all time',
      text: 'Nevermind by Nirvana, Abbey Road by The Beatles and Kind of Blue by Miles Davis.',
      url: `${window.location.origin}/list/abcdefghjk`,
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('encodes a code that needs it', async () => {
    render(<ShareListButton list={{ ...LIST, id: 'a/b' }} variant="icon" />);

    await tap('Share');

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/list/a%2Fb`);
  });
});
