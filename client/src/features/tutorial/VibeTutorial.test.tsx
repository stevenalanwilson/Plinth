import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('./useDemoArtwork', () => ({ useDemoArtwork: vi.fn() }));

import { useDemoArtwork } from './useDemoArtwork';
import { VibeTutorial } from './VibeTutorial';
import {
  LAST_PAGE_MS,
  PHASE_DURATION_MS,
  TUTORIAL_PHASES,
  TutorialPhase,
} from './tutorialTimeline';
import { TUTORIAL_EXAMPLES } from './tutorialExamples';

const RUN_MS = TUTORIAL_PHASES.reduce((total, phase) => total + PHASE_DURATION_MS[phase], 0);
const EXAMPLES_MS = RUN_MS * TUTORIAL_EXAMPLES.length;
const PLAY_THROUGH_MS = EXAMPLES_MS + LAST_PAGE_MS;
const mockUseDemoArtwork = vi.mocked(useDemoArtwork);

/** Milliseconds from the start of a run to halfway through a phase. */
function midway(target: TutorialPhase): number {
  let total = 0;
  for (const phase of TUTORIAL_PHASES) {
    if (phase === target) return total + PHASE_DURATION_MS[phase] / 2;
    total += PHASE_DURATION_MS[phase];
  }
  return total;
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function stage(): HTMLElement {
  return screen.getByTestId('vibe-tutorial-stage');
}

function section(): HTMLElement {
  return screen.getByRole('region', { name: 'Plinth: Find your vibe' });
}

/** The album the demo has found, or null while it hasn't found one yet. */
function shownAlbum(): string | null {
  return stage().querySelector('.vibe-tutorial-album')?.textContent ?? null;
}

function isOnLastPage(): boolean {
  return screen.queryByText('Find your vibe') !== null;
}

function isLit(name: string): boolean {
  return within(stage()).getByText(name).getAttribute('data-lit') === 'true';
}

function reduceMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', () => ({
    matches: reduce,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

/** Holds whether the demo is over, as the page does. */
function Harness({ onEnd }: { readonly onEnd: () => void }): React.ReactElement {
  const [isOver, setIsOver] = useState(false);
  return (
    <VibeTutorial
      isOver={isOver}
      onEnd={() => {
        setIsOver(true);
        onEnd();
      }}
    />
  );
}

function renderDemo(): Mock {
  const onEnd = vi.fn();
  render(<Harness onEnd={onEnd} />);
  return onEnd;
}

beforeEach(() => {
  vi.useFakeTimers();
  reduceMotion(false);
  mockUseDemoArtwork.mockReset().mockReturnValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('VibeTutorial', () => {
  it('says what it shows, for people who cannot see the demo', () => {
    renderDemo();

    expect(section()).toBeInTheDocument();
    expect(screen.getByText(/Describe your vibe, pick a genre and a mood/)).toBeInTheDocument();
  });

  it('starts by describing a vibe, with nothing chosen yet', () => {
    renderDemo();

    expect(shownAlbum()).toBeNull();
    expect(isLit('Jazz')).toBe(false);
    expect(screen.getByText('1 · Describe your vibe')).toBeInTheDocument();
  });

  it('types the vibe out a little at a time', () => {
    renderDemo();

    advance(midway('vibe'));

    const typed = stage().querySelector('.vibe-tutorial-vibe')?.textContent ?? '';
    expect(typed.length).toBeGreaterThan(0);
    expect('Rain on the window, nowhere to be'.startsWith(typed)).toBe(true);
    expect(typed).not.toBe('Rain on the window, nowhere to be');
  });

  it('picks the genre, then the mood', () => {
    renderDemo();

    advance(midway('genre'));
    expect(isLit('Jazz')).toBe(true);
    expect(isLit('Late night')).toBe(false);

    advance(midway('mood') - midway('genre'));
    expect(isLit('Late night')).toBe(true);
    expect(isLit('Folk')).toBe(false);
  });

  it('turns up the record once the button has been pressed', () => {
    renderDemo();

    advance(midway('found'));

    expect(shownAlbum()).toBe('Kind of Blue');
    expect(within(stage()).getByText('Miles Davis · 1959')).toBeInTheDocument();
    expect(screen.getByText('A record for that moment')).toBeInTheDocument();
  });

  it('shows the real cover once it has been found', () => {
    mockUseDemoArtwork.mockReturnValue('/cover.jpg');
    renderDemo();

    advance(midway('found'));

    expect(stage().querySelector('.vibe-tutorial-sleeve img')).toHaveAttribute('src', '/cover.jpg');
    expect(mockUseDemoArtwork).toHaveBeenCalledWith('Miles Davis', 'Kind of Blue', true);
  });

  it('uses the placeholder sleeve while there is no cover', () => {
    renderDemo();
    advance(midway('found'));
    expect(stage().querySelector('.vibe-tutorial-sleeve img')).toBeNull();
    expect(within(stage()).getByRole('img', { hidden: true })).toBeInTheDocument();
  });

  it('swaps in the placeholder sleeve if the cover fails to load', () => {
    mockUseDemoArtwork.mockReturnValue('/broken.jpg');
    renderDemo();
    advance(midway('found'));

    fireEvent.error(stage().querySelector('.vibe-tutorial-sleeve img') as HTMLImageElement);

    expect(stage().querySelector('.vibe-tutorial-sleeve img')).toBeNull();
  });

  it('closes on a Find your vibe page once the example has played', () => {
    const onEnd = renderDemo();

    advance(EXAMPLES_MS - 100);
    expect(isOnLastPage()).toBe(false);
    expect(shownAlbum()).toBe('Kind of Blue');

    advance(200);
    expect(isOnLastPage()).toBe(true);
    expect(screen.queryByRole('button', { name: 'Skip demo' })).not.toBeInTheDocument();
    expect(onEnd).not.toHaveBeenCalled();
    expect(section()).toHaveAttribute('data-over', 'false');
  });

  it('ends and fades down once the last page has been up a while', () => {
    const onEnd = renderDemo();

    advance(PLAY_THROUGH_MS + 100);

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(section()).toHaveAttribute('data-over', 'true');
    expect(isOnLastPage()).toBe(true);
  });

  it('jumps to the last page as soon as the visitor taps anywhere', () => {
    const onEnd = renderDemo();
    advance(midway('genre'));

    fireEvent.pointerDown(document.body);

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(section()).toHaveAttribute('data-over', 'true');
    expect(isOnLastPage()).toBe(true);
  });

  it('jumps to the last page as soon as the visitor presses a key', () => {
    const onEnd = renderDemo();

    fireEvent.keyDown(document.body, { key: 'Tab' });

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(isOnLastPage()).toBe(true);
  });

  it('shows its title while playing, but not on the last page', () => {
    renderDemo();
    const title = screen.getByRole('heading', { name: 'Plinth: Find your vibe' });
    expect(title).toHaveAttribute('data-faded', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Skip demo' }));

    expect(title).toHaveAttribute('data-faded', 'true');
  });

  it('skips to the last page, and then offers no skip', () => {
    const onEnd = renderDemo();

    fireEvent.click(screen.getByRole('button', { name: 'Skip demo' }));

    expect(onEnd).toHaveBeenCalled();
    expect(isOnLastPage()).toBe(true);
    expect(screen.queryByRole('button', { name: 'Skip demo' })).not.toBeInTheDocument();
  });

  it('shows the last page, faded and without replaying, when it comes back after ending', () => {
    render(<VibeTutorial isOver onEnd={vi.fn()} />);

    expect(isOnLastPage()).toBe(true);
    expect(section()).toHaveAttribute('data-over', 'true');
    expect(section()).toHaveAttribute('data-started-over', 'true');
    expect(screen.queryByRole('button', { name: 'Skip demo' })).not.toBeInTheDocument();
    expect(mockUseDemoArtwork).toHaveBeenCalledWith('Miles Davis', 'Kind of Blue', false);
  });

  it('animates its entrance on a first showing, even once it has ended', () => {
    renderDemo();

    fireEvent.click(screen.getByRole('button', { name: 'Skip demo' }));

    expect(section()).toHaveAttribute('data-started-over', 'false');
  });

  it('shows a finished example, without moving, to anyone who asked for less motion', () => {
    reduceMotion(true);
    const onEnd = renderDemo();

    expect(shownAlbum()).toBe('Kind of Blue');
    expect(isLit('Jazz')).toBe(true);

    advance(PLAY_THROUGH_MS * 2);
    expect(shownAlbum()).toBe('Kind of Blue');
    expect(onEnd).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(isOnLastPage()).toBe(true);
  });

  it('asks the visitor to have a go', () => {
    renderDemo();

    expect(
      screen.getByText('Your turn. Set your vibe and Plinth will find one for you.'),
    ).toBeInTheDocument();
  });
});
