import { describe, it, expect } from 'vitest';
import { HistoryEntry } from '../../types/history';
import { FeedbackStatus } from '../../types/feedback';
import { describeTaste } from './describeTaste';

interface Album {
  readonly genres?: string[];
  readonly year?: string;
  readonly country?: string;
  readonly status?: FeedbackStatus | null;
}

let counter = 0;

// No year by default, so a test only gets a decade in its sentence when it asks for one.
function album({ genres, year = '', country, status }: Album = {}): HistoryEntry {
  counter += 1;
  return {
    id: `album-${counter}`,
    createdAt: '2026-11-01T10:00:00.000Z',
    recommendation: {
      artist: `Artist ${counter}`,
      album: `Album ${counter}`,
      year,
      reason: 'Good.',
      genres,
      country,
    },
    artworkResponse: { artworkUrl: null, year, appleMusicUrl: null },
    ...(status === undefined ? {} : { feedback: { status, at: '2026-11-02T10:00:00.000Z' } }),
  };
}

function many(count: number, details: Album = {}): HistoryEntry[] {
  return Array.from({ length: count }, () => album(details));
}

const POST_PUNK_UK = { genres: ['Post-punk'], year: '1981', country: 'United Kingdom' };

describe('describeTaste', () => {
  describe('when there is not enough to go on', () => {
    it('says nothing for an empty library', () => {
      expect(describeTaste([])).toBeNull();
    });

    it('says nothing for fewer than five albums', () => {
      expect(describeTaste(many(4, POST_PUNK_UK))).toBeNull();
    });

    it('speaks from five albums', () => {
      expect(describeTaste(many(5, POST_PUNK_UK))).not.toBeNull();
    });

    it('does not count albums marked Not for me towards the five', () => {
      const library = [
        ...many(4, POST_PUNK_UK),
        ...many(3, { ...POST_PUNK_UK, status: 'not-for-me' }),
      ];

      expect(describeTaste(library)).toBeNull();
    });
  });

  describe('the lean', () => {
    it('names the style, the decade and the country when one of each stands out', () => {
      expect(describeTaste(many(6, POST_PUNK_UK))?.text).toBe(
        'You lean towards Post-punk, mostly from the 1980s and the United Kingdom.',
      );
    });

    it('names two styles when each is a real share of the library', () => {
      const library = [
        ...many(3, { genres: ['Post-punk'] }),
        ...many(3, { genres: ['Krautrock'] }),
      ];

      expect(describeTaste(library)?.text).toContain('You lean towards Krautrock and Post-punk');
    });

    it('names no more than two styles', () => {
      const library = [
        ...many(2, { genres: ['Jazz'] }),
        ...many(2, { genres: ['Folk'] }),
        ...many(2, { genres: ['Ambient'] }),
        ...many(2, { genres: ['Metal'] }),
      ];

      const text = describeTaste(library)?.text ?? '';

      expect(text.match(/Jazz|Folk|Ambient|Metal/g)).toHaveLength(2);
    });

    it('leaves out a style that is only a sliver of the library', () => {
      const library = [...many(9, { genres: ['Post-punk'] }), ...many(1, { genres: ['Jazz'] })];

      expect(describeTaste(library)?.text).toBe('You lean towards Post-punk.');
    });

    it('counts an album with two styles towards both', () => {
      const library = many(6, { genres: ['Krautrock', 'Electronic'] });

      expect(describeTaste(library)?.text).toContain('Electronic and Krautrock');
    });

    it('treats styles that differ only in case as one', () => {
      const library = [
        ...many(3, { genres: ['Post-punk'] }),
        ...many(3, { genres: ['post-punk'] }),
      ];

      expect(describeTaste(library)?.text).toBe('You lean towards Post-punk.');
    });

    it('leaves out a decade or country that does not stand out', () => {
      const library = [
        ...many(2, { genres: ['Jazz'], year: '1955', country: 'USA' }),
        ...many(2, { genres: ['Jazz'], year: '1975', country: 'France' }),
        ...many(2, { genres: ['Jazz'], year: '1995', country: 'Japan' }),
      ];

      expect(describeTaste(library)?.text).toBe('You lean towards Jazz.');
    });

    it('names a decade but no country when only the decade stands out', () => {
      const library = [
        album({ genres: ['Jazz'], year: '1961', country: 'USA' }),
        album({ genres: ['Jazz'], year: '1962', country: 'France' }),
        album({ genres: ['Jazz'], year: '1963', country: 'Japan' }),
        album({ genres: ['Jazz'], year: '1964', country: 'Norway' }),
        album({ genres: ['Jazz'], year: '1975', country: 'Brazil' }),
        album({ genres: ['Jazz'], year: '1995', country: 'Mali' }),
        album({ genres: ['Jazz'], year: '2005', country: 'Chile' }),
      ];

      expect(describeTaste(library)?.text).toBe('You lean towards Jazz, mostly from the 1960s.');
    });

    it('ignores an album with no usable year', () => {
      const library = [
        ...many(5, { genres: ['Jazz'], year: '1961' }),
        ...many(5, { genres: ['Jazz'], year: '' }),
      ];

      expect(describeTaste(library)?.text).toBe('You lean towards Jazz, mostly from the 1960s.');
    });

    it('describes places alone when no style stands out', () => {
      const library = [
        ...many(2, { genres: ['Jazz'], year: '1981', country: 'Germany' }),
        ...many(2, { genres: ['Folk'], year: '1983', country: 'Germany' }),
        ...many(2, { genres: ['Metal'], year: '1985', country: 'Germany' }),
        ...many(2, { genres: ['Ambient'], year: '1987', country: 'Germany' }),
        ...many(2, { genres: ['Funk'], year: '1989', country: 'Germany' }),
        ...many(2, { genres: ['Soul'], year: '1982', country: 'Germany' }),
        ...many(2, { genres: ['Dub'], year: '1984', country: 'Germany' }),
        ...many(2, { genres: ['Rock'], year: '1986', country: 'Germany' }),
      ];

      expect(describeTaste(library)?.text).toBe(
        'Your picks are mostly from the 1980s and Germany.',
      );
    });

    it('says so when nothing stands out at all', () => {
      const styles = ['Jazz', 'Folk', 'Metal', 'Ambient', 'Funk', 'Soul', 'Dub', 'Rock'];
      const decades = ['1955', '1965', '1975', '1985', '1995', '2005', '2015', '2025'];
      const countries = ['USA', 'France', 'Japan', 'Norway', 'Brazil', 'Mali', 'Chile', 'Iceland'];
      const library = styles.flatMap((genre, i) =>
        many(2, { genres: [genre], year: decades[i], country: countries[i] }),
      );

      expect(describeTaste(library)?.text).toBe(
        'Your picks are wide-ranging so far: no single style, era or country stands out.',
      );
    });

    it('works with no genre or country data at all', () => {
      expect(describeTaste(many(6, { year: '1981' }))?.text).toBe(
        'Your picks are mostly from the 1980s.',
      );
    });
  });

  describe('countries', () => {
    it.each([
      ['UK', 'the UK'],
      ['USA', 'the USA'],
      ['United Kingdom', 'the United Kingdom'],
      ['United States', 'the United States'],
      ['Netherlands', 'the Netherlands'],
      ['Germany', 'Germany'],
      ['Brazil', 'Brazil'],
    ])('writes %s as "from %s"', (country, written) => {
      const text = describeTaste(many(6, { genres: ['Jazz'], year: '', country }))?.text;

      expect(text).toBe(`You lean towards Jazz, mostly from ${written}.`);
    });
  });

  describe('weighing what the listener answered', () => {
    it('counts albums owned or wanted more than ones nobody answered', () => {
      const library = [
        ...many(6, { genres: ['Jazz'] }),
        ...many(3, { genres: ['Post-punk'], status: 'own' }),
      ];

      // Jazz weighs 6, Post-punk 9: the smaller pile leads because it's the one they own.
      expect(describeTaste(library)?.text).toBe('You lean towards Post-punk and Jazz.');
    });

    it('counts saved albums more than unanswered ones, and less than owned ones', () => {
      const library = [
        ...many(2, { genres: ['Folk'], status: 'save' }),
        ...many(2, { genres: ['Metal'], status: 'own' }),
        ...many(2, { genres: ['Funk'] }),
      ];

      expect(describeTaste(library)?.text).toBe('You lean towards Metal and Folk.');
    });

    it('does not count albums marked Not for me in favour of their style', () => {
      const library = [
        ...many(5, { genres: ['Post-punk'], status: 'own' }),
        ...many(5, { genres: ['Jazz'], status: 'not-for-me' }),
      ];

      expect(describeTaste(library)?.text).not.toContain('Jazz,');
      expect(describeTaste(library)?.text).toContain('You lean towards Post-punk');
    });

    it('counts having heard an album as no more than not having answered', () => {
      const library = [
        ...many(3, { genres: ['Jazz'], status: 'heard' }),
        ...many(3, { genres: ['Folk'] }),
      ];

      expect(describeTaste(library)?.text).toBe('You lean towards Folk and Jazz.');
    });

    it('treats a rating that was taken back as unanswered', () => {
      const library = [
        ...many(3, { genres: ['Jazz'], status: null }),
        ...many(3, { genres: ['Folk'] }),
      ];

      expect(describeTaste(library)?.text).toBe('You lean towards Folk and Jazz.');
    });
  });

  describe('what the listener passes on', () => {
    const liked = many(6, { genres: ['Post-punk'], status: 'own' });

    it('says so when most of what they turned down was one style', () => {
      const library = [...liked, ...many(3, { genres: ['Metal'], status: 'not-for-me' })];

      expect(describeTaste(library)?.text).toBe(
        'You lean towards Post-punk. You tend to pass on Metal.',
      );
    });

    it('says nothing after only one or two passes', () => {
      const library = [...liked, ...many(2, { genres: ['Metal'], status: 'not-for-me' })];

      expect(describeTaste(library)?.text).not.toContain('pass on');
    });

    it('says nothing when the passes are spread across styles', () => {
      const library = [
        ...liked,
        album({ genres: ['Metal'], status: 'not-for-me' }),
        album({ genres: ['Jazz'], status: 'not-for-me' }),
        album({ genres: ['Folk'], status: 'not-for-me' }),
      ];

      expect(describeTaste(library)?.text).not.toContain('pass on');
    });

    it('does not say they pass on a style the sentence before says they lean towards', () => {
      const library = [...liked, ...many(3, { genres: ['post-punk'], status: 'not-for-me' })];

      expect(describeTaste(library)?.text).toBe('You lean towards Post-punk.');
    });

    it('works out the passes from albums that have a genre', () => {
      const library = [
        ...liked,
        album({ status: 'not-for-me' }),
        ...many(3, { genres: ['Metal'], status: 'not-for-me' }),
      ];

      expect(describeTaste(library)?.text).toContain('You tend to pass on Metal.');
    });
  });

  it('says how many albums it was worked out from, passes included', () => {
    const library = [
      ...many(6, POST_PUNK_UK),
      ...many(2, { ...POST_PUNK_UK, status: 'not-for-me' }),
    ];

    expect(describeTaste(library)?.albumCount).toBe(8);
  });

  it('reads the same however the library is ordered', () => {
    const library = [...many(3, { genres: ['Post-punk'] }), ...many(3, { genres: ['Krautrock'] })];

    expect(describeTaste([...library].reverse())?.text).toBe(describeTaste(library)?.text);
  });

  it('does not change the library it is given', () => {
    const library = many(6, POST_PUNK_UK);
    const copy = [...library];

    describeTaste(library);

    expect(library).toEqual(copy);
  });
});
