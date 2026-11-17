import { describe, it, expect } from 'vitest';
import { capHook, isCutHook, MAX_HOOK_LENGTH } from './hookText';

describe('capHook', () => {
  it('leaves a hook within the limit alone', () => {
    const hook = 'A tightly coiled record that balances despair and drive.';

    expect(capHook(hook)).toBe(hook);
    expect(capHook('x'.repeat(MAX_HOOK_LENGTH))).toBe('x'.repeat(MAX_HOOK_LENGTH));
  });

  it('ends at the last full sentence that fits', () => {
    const first = 'A quietly adventurous left turn into electric grit and autumnal songwriting.';
    const hook = `${first} It trades the piano-bar intimacy of her early records for something moodier and stranger.`;

    expect(capHook(hook)).toBe(first);
  });

  it('otherwise ends at a whole word, with an ellipsis', () => {
    const hook =
      "A quietly stunning showcase of Jones's voice in conversation with artists ranging from Outkast's Dre 3000 to Foo Fighters' Dave Grohl, revealing her remarkable range";

    const capped = capHook(hook);

    expect(capped).toBe(
      "A quietly stunning showcase of Jones's voice in conversation with artists ranging from Outkast's Dre 3000 to Foo Fighters' Dave Grohl, revealing her remarkable…",
    );
    expect(capped.length).toBeLessThanOrEqual(MAX_HOOK_LENGTH);
  });

  it('ignores a sentence end so early that little would be left', () => {
    const hook = `Bleak. ${'word '.repeat(40)}end`;

    expect(capHook(hook).endsWith('…')).toBe(true);
    expect(capHook(hook).length).toBeGreaterThan(100);
  });

  it('does not treat a full stop inside a word as a sentence end', () => {
    const hook = `Made with St.Vincent ${'and more '.repeat(20)}`;

    expect(capHook(hook).endsWith('…')).toBe(true);
  });

  it('drops a dangling comma or dash before the ellipsis', () => {
    const hook = `${'word '.repeat(30)}word, ${'more '.repeat(10)}`;

    expect(capHook(hook)).not.toMatch(/[,—-]…$/);
  });

  it('cuts a single overlong word to fit', () => {
    const capped = capHook('x'.repeat(200));

    expect(capped.length).toBe(MAX_HOOK_LENGTH);
    expect(capped.endsWith('…')).toBe(true);
  });

  it('never returns more than the limit', () => {
    const samples = [
      'word '.repeat(60),
      `${'a'.repeat(158)} b c`,
      `${'sentence one. '.repeat(20)}`,
      `${'a, '.repeat(80)}`,
    ];

    samples.forEach((hook) => expect(capHook(hook).length).toBeLessThanOrEqual(MAX_HOOK_LENGTH));
  });
});

describe('isCutHook', () => {
  it('spots a hook that was cut short', () => {
    expect(isCutHook(capHook('word '.repeat(60)))).toBe(true);
    expect(isCutHook('A whole sentence.')).toBe(false);
  });
});
