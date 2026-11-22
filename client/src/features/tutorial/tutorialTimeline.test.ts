import { describe, it, expect } from 'vitest';
import {
  examplesLength,
  hasReached,
  LAST_PAGE_MS,
  PHASE_DURATION_MS,
  playLength,
  positionAt,
  TUTORIAL_PHASES,
} from './tutorialTimeline';

const RUN_MS = TUTORIAL_PHASES.reduce((total, phase) => total + PHASE_DURATION_MS[phase], 0);

describe('positionAt', () => {
  it('starts on the first example with nothing set', () => {
    expect(positionAt(0, 3)).toEqual({ exampleIndex: 0, phase: 'reset', progress: 0 });
  });

  it('moves into typing the vibe once the reset is over', () => {
    const position = positionAt(PHASE_DURATION_MS.reset + PHASE_DURATION_MS.vibe / 2, 3);

    expect(position.phase).toBe('vibe');
    expect(position.progress).toBeCloseTo(0.5);
  });

  it('ends a run on the record that was found', () => {
    expect(positionAt(RUN_MS - 1, 3)).toMatchObject({ exampleIndex: 0, phase: 'found' });
  });

  it('goes on to the next example after a run', () => {
    expect(positionAt(RUN_MS, 3)).toMatchObject({ exampleIndex: 1, phase: 'reset' });
  });

  it('loops back to the first example after the last', () => {
    expect(positionAt(RUN_MS * 3, 3)).toMatchObject({ exampleIndex: 0, phase: 'reset' });
  });

  it('copes with no examples and with time before the start', () => {
    expect(positionAt(RUN_MS * 2, 0)).toMatchObject({ exampleIndex: 0 });
    expect(positionAt(-50, 3)).toMatchObject({ exampleIndex: 0, phase: 'reset' });
  });
});

describe('examplesLength and playLength', () => {
  it('give one run for each example, then the last page on top', () => {
    expect(examplesLength(3)).toBe(RUN_MS * 3);
    expect(examplesLength(0)).toBe(RUN_MS);
    expect(playLength(3)).toBe(RUN_MS * 3 + LAST_PAGE_MS);
  });
});

describe('hasReached', () => {
  it('counts a phase as reached from that phase onwards', () => {
    expect(hasReached('genre', 'genre')).toBe(true);
    expect(hasReached('found', 'genre')).toBe(true);
    expect(hasReached('vibe', 'genre')).toBe(false);
  });
});
