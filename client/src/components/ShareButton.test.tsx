import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ShareButton } from './ShareButton';

const writeText = vi.fn();
const nativeShare = vi.fn();

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

function renderButton(slug = 'the-sound-jeopardy'): void {
  render(
    <ShareButton slug={slug} album="Jeopardy" artist="The Sound" hook="A tightly coiled record." />,
  );
}

describe('ShareButton', () => {
  it('renders a Share button', () => {
    renderButton();

    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('copies the album’s link on this site and confirms it', async () => {
    renderButton();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    });

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/album/the-sound-jeopardy`);
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument();
  });

  it('goes back to Share after a moment', async () => {
    renderButton();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    });

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('announces the copy to screen readers', async () => {
    renderButton();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    });

    expect(screen.getByRole('status')).toHaveTextContent('Link copied');
  });

  it('encodes a slug in another script', async () => {
    renderButton('大瀧詠一-a-long-vacation');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    });

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/album/${encodeURIComponent('大瀧詠一-a-long-vacation')}`,
    );
  });

  it('opens the share sheet on a phone, with the album, artist and hook', async () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    Object.defineProperty(navigator, 'share', { value: nativeShare, configurable: true });
    renderButton();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    });

    expect(nativeShare).toHaveBeenCalledWith({
      title: 'Jeopardy by The Sound',
      text: 'A tightly coiled record.',
      url: `${window.location.origin}/album/the-sound-jeopardy`,
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('describes the album when it has no hook', async () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    Object.defineProperty(navigator, 'share', { value: nativeShare, configurable: true });
    render(
      <ShareButton slug="the-sound-jeopardy" album="Jeopardy" artist="The Sound" hook={null} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    });

    expect(nativeShare).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Jeopardy by The Sound, a record picked on Plinth.' }),
    );
  });

  describe('as an icon', () => {
    function renderIcon(): void {
      render(
        <ShareButton
          slug="the-sound-jeopardy"
          album="Jeopardy"
          artist="The Sound"
          hook="A tightly coiled record."
          iconOnly
        />,
      );
    }

    it('shows no text but is still named Share, with a tooltip', () => {
      renderIcon();

      const button = screen.getByRole('button', { name: 'Share' });
      expect(button).toHaveTextContent('');
      expect(button).toHaveAttribute('title', 'Share');
    });

    it('says the link was copied once it has been', async () => {
      renderIcon();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
      });

      expect(screen.getByRole('button', { name: 'Link copied' })).toHaveAttribute(
        'data-copied',
        'true',
      );
    });
  });
});
