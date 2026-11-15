// Bracketed edition and reissue notes that still name the same album, e.g. "Untrue (Remastered)".
const EDITION_NOTE =
  /\s*[([][^)\]]*\b(remaster(ed)?|deluxe|edition|expanded|anniversary|reissue|bonus|mono|stereo|version)\b[^)\]]*[)\]]/gi;
// Streaming services also write editions as a dash suffix, e.g. "Mezzanine - 2011 Remaster".
const REMASTER_SUFFIX = /\s+-\s+[^-]*\bremaster(ed)?\b.*$/i;
// Letters that Unicode doesn't decompose into a base letter plus accent, e.g. "Ágætis byrjun".
const UNDECOMPOSED_LETTERS: Readonly<Record<string, string>> = {
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ß: 'ss',
  ð: 'd',
  þ: 'th',
  ł: 'l',
  đ: 'd',
};

/**
 * Reduces an artist name or album title to a form that ignores case, accents, punctuation,
 * "&" vs "and", a leading "The" and edition notes, so two spellings of one album compare equal.
 */
export function normaliseName(value: string): string {
  const normalised = value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(EDITION_NOTE, ' ')
    .replace(REMASTER_SUFFIX, '')
    .toLowerCase()
    .replace(/[æœøßðþłđ]/g, (letter) => UNDECOMPOSED_LETTERS[letter] ?? letter)
    .replace(/['‘’]|(?<=\p{L})\.(?=\p{L})/gu, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^the /, '');

  // Names made only of punctuation (the band !!!) would otherwise all normalise to "".
  return normalised === '' ? value.trim().toLowerCase() : normalised;
}

export function titlesMatch(requested: string, candidate: string): boolean {
  return normaliseName(requested) === normaliseName(candidate);
}

/**
 * Artist names match when equal, or when one is the other plus extra whole words, so "Eno"
 * matches "Brian Eno". Callers pair this with an exact title match, which keeps it safe.
 */
export function artistsMatch(requested: string, candidate: string): boolean {
  const requestedName = normaliseName(requested);
  const candidateName = normaliseName(candidate);
  if (requestedName === candidateName) return true;
  return (
    ` ${candidateName} `.includes(` ${requestedName} `) ||
    ` ${requestedName} `.includes(` ${candidateName} `)
  );
}
