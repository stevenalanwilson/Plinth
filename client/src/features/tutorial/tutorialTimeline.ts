/** The steps of one run through the demo, in the order they play. */
export const TUTORIAL_PHASES = [
  'reset',
  'vibe',
  'genre',
  'mood',
  'ask',
  'finding',
  'found',
] as const;

export type TutorialPhase = (typeof TUTORIAL_PHASES)[number];

export const PHASE_DURATION_MS: Readonly<Record<TutorialPhase, number>> = {
  reset: 300,
  vibe: 1200,
  genre: 700,
  mood: 700,
  ask: 400,
  finding: 700,
  // Long enough to read the one-line description of the record.
  found: 3000,
};

export const STEP_CAPTIONS: Readonly<Record<TutorialPhase, string>> = {
  reset: '1 · Describe your vibe',
  vibe: '1 · Describe your vibe',
  genre: '2 · Pick a genre',
  mood: '3 · Choose a mood',
  ask: '4 · Ask Plinth',
  finding: '4 · Ask Plinth',
  found: 'A record for that moment',
};

export interface TutorialPosition {
  readonly exampleIndex: number;
  readonly phase: TutorialPhase;
  /** How far through the current phase, from 0 to just under 1. */
  readonly progress: number;
}

/** The finished first example, shown on its own to anyone who has asked for less motion. */
export const STILL_POSITION: TutorialPosition = { exampleIndex: 0, phase: 'found', progress: 0 };

const RUN_MS = TUTORIAL_PHASES.reduce((total, phase) => total + PHASE_DURATION_MS[phase], 0);

/** Where the demo is after it has played for a while, looping through every example. */
export function positionAt(elapsedMs: number, exampleCount: number): TutorialPosition {
  const count = Math.max(exampleCount, 1);
  const intoLoop = Math.max(elapsedMs, 0) % (RUN_MS * count);
  const exampleIndex = Math.floor(intoLoop / RUN_MS);
  let intoRun = intoLoop - exampleIndex * RUN_MS;

  for (const phase of TUTORIAL_PHASES) {
    const duration = PHASE_DURATION_MS[phase];
    if (intoRun < duration) return { exampleIndex, phase, progress: intoRun / duration };
    intoRun -= duration;
  }
  return { exampleIndex, phase: 'found', progress: 0 };
}

/** How long the closing "Find your vibe" page stays up before the demo ends. */
export const LAST_PAGE_MS = 2000;

/** How long it takes to play every example once, after which the last page shows. */
export function examplesLength(exampleCount: number): number {
  return RUN_MS * Math.max(exampleCount, 1);
}

/** How long the whole demo takes: every example once, then the last page. */
export function playLength(exampleCount: number): number {
  return examplesLength(exampleCount) + LAST_PAGE_MS;
}

/** Whether the demo has got as far as a phase, so what that phase sets stays set afterwards. */
export function hasReached(current: TutorialPhase, target: TutorialPhase): boolean {
  return TUTORIAL_PHASES.indexOf(current) >= TUTORIAL_PHASES.indexOf(target);
}
