// A hook appears on album pages and in link previews, which truncate long text anyway. The cap
// also stops a vibe query steering Claude into writing a paragraph onto a public page.
export const MAX_HOOK_LENGTH = 160;

const ELLIPSIS = '…';
// A sentence end this early would leave too little of the hook to be worth keeping.
const MIN_SENTENCE_LENGTH = MAX_HOOK_LENGTH / 3;
const TRAILING_PUNCTUATION = /[\s,;:—–-]+$/;

/**
 * Fits a hook within MAX_HOOK_LENGTH without cutting a word in half: it ends at the last full
 * sentence that fits, or failing that at the last whole word, marked with an ellipsis.
 */
export function capHook(hook: string): string {
  if (hook.length <= MAX_HOOK_LENGTH) return hook;

  const window = hook.slice(0, MAX_HOOK_LENGTH);
  const sentenceEnds = [...window.matchAll(/[.!?](?=\s|$)/g)].map((match) => match.index ?? -1);
  const lastSentenceEnd = sentenceEnds.at(-1) ?? -1;
  if (lastSentenceEnd + 1 >= MIN_SENTENCE_LENGTH) return window.slice(0, lastSentenceEnd + 1);

  const room = hook.slice(0, MAX_HOOK_LENGTH - ELLIPSIS.length + 1);
  const lastSpace = room.lastIndexOf(' ');
  const cut = lastSpace > 0 ? room.slice(0, lastSpace) : room.slice(0, -1);
  return `${cut.replace(TRAILING_PUNCTUATION, '')}${ELLIPSIS}`;
}

/** True for a hook that capHook had to cut short, which reads badly as a first impression. */
export function isCutHook(hook: string): boolean {
  return hook.endsWith(ELLIPSIS);
}
