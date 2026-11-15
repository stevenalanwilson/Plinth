import { describe, it, expect } from 'vitest';
import { artistsMatch, normaliseName, titlesMatch } from './musicNames';

describe('normaliseName', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normaliseName('Sigur Rós')).toBe('sigur ros');
    expect(normaliseName('Ágætis byrjun')).toBe('agaetis byrjun');
    expect(normaliseName('Mötley Crüe')).toBe('motley crue');
    expect(normaliseName('Ege Bamyası')).toBe('ege bamyasi');
    expect(normaliseName("(What's the Story) Morning Glory?")).toBe(
      normaliseName('(Whats The Story) Morning Glory'),
    );
  });

  it('joins acronyms and contractions instead of splitting them', () => {
    expect(normaliseName('R.E.M.')).toBe('rem');
    expect(normaliseName('Don’t Stand Me Down')).toBe('dont stand me down');
  });

  it('treats "&" and "and" the same', () => {
    expect(normaliseName('Simon & Garfunkel')).toBe(normaliseName('Simon and Garfunkel'));
  });

  it('drops a leading "The"', () => {
    expect(normaliseName('The Sound')).toBe('sound');
  });

  it('drops edition notes', () => {
    expect(normaliseName('Untrue (Remastered)')).toBe('untrue');
    expect(normaliseName('Mezzanine [Deluxe Edition]')).toBe('mezzanine');
    expect(normaliseName('Mezzanine - 2011 Remaster')).toBe('mezzanine');
  });

  it('keeps names made only of punctuation', () => {
    expect(normaliseName('!!!')).toBe('!!!');
  });
});

describe('titlesMatch', () => {
  it('matches the same title written differently', () => {
    expect(titlesMatch('Jeopardy', 'Jeopardy (2011 Remaster)')).toBe(true);
  });

  it('rejects a different title that contains the requested one', () => {
    expect(
      titlesMatch('Jeopardy', 'Jeopardy / From the Lion’s Mouth / All Fall Down... Plus'),
    ).toBe(false);
    expect(titlesMatch('Jeopardy', 'Jeopardy! (Cover Version) - Single')).toBe(false);
  });

  it('keeps singles and EPs distinct from the album', () => {
    expect(titlesMatch('Untrue', 'Untrue - EP')).toBe(false);
  });
});

describe('artistsMatch', () => {
  it('matches equal names', () => {
    expect(artistsMatch('The Sound', 'Sound')).toBe(true);
  });

  it('matches a name that adds whole words', () => {
    expect(artistsMatch('Eno', 'Brian Eno')).toBe(true);
  });

  it('rejects a name that only shares letters', () => {
    expect(artistsMatch('The Sound', 'Soundgarden')).toBe(false);
  });

  it('rejects an unrelated artist', () => {
    expect(artistsMatch('The Sound', 'Television’s Greatest Hits Band')).toBe(false);
  });
});
