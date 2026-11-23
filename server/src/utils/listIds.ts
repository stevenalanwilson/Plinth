import { randomInt } from 'crypto';

// No letters or digits that look alike (i, l, o, 0, 1), since people may read a link aloud.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const LIST_ID_LENGTH = 10;

/** A short random code for a list. With 31 letters and digits in 10 places it can't be guessed. */
export function newListId(): string {
  let id = '';
  for (let i = 0; i < LIST_ID_LENGTH; i++) id += ALPHABET[randomInt(ALPHABET.length)];
  return id;
}

export function isListId(value: string): boolean {
  return (
    value.length === LIST_ID_LENGTH && [...value].every((character) => ALPHABET.includes(character))
  );
}
