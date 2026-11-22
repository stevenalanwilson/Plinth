import { describe, it, expect } from 'vitest';
import { TUTORIAL_EXAMPLES, TUTORIAL_GENRES, TUTORIAL_MOODS } from './tutorialExamples';

describe('tutorial examples', () => {
  it('only choose pills the demo shows', () => {
    for (const example of TUTORIAL_EXAMPLES) {
      expect(TUTORIAL_GENRES).toContain(example.genre);
      expect(TUTORIAL_MOODS).toContain(example.mood);
    }
  });
});
