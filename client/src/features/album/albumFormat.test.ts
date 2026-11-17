import { describe, it, expect } from 'vitest';
import { formatCountry, formatReleaseDate, formatTrackLength } from './albumFormat';

describe('formatReleaseDate', () => {
  it('writes a full date out', () => {
    expect(formatReleaseDate('2012-01-17')).toBe('17 January 2012');
  });

  it('writes a month and year', () => {
    expect(formatReleaseDate('1980-11')).toBe('November 1980');
  });

  it('leaves a year alone', () => {
    expect(formatReleaseDate('1980')).toBe('1980');
  });

  it('is not thrown by the first or last day of a month, whatever the time zone', () => {
    expect(formatReleaseDate('1980-11-01')).toBe('1 November 1980');
    expect(formatReleaseDate('1980-12-31')).toBe('31 December 1980');
  });

  it('returns a date it cannot read as it was given', () => {
    expect(formatReleaseDate('sometime')).toBe('sometime');
    expect(formatReleaseDate('1980-13')).toBe('1980-13');
  });
});

describe('formatCountry', () => {
  it('names a country from its code', () => {
    expect(formatCountry('GB')).toBe('United Kingdom');
    expect(formatCountry('FR')).toBe('France');
  });

  it('names the MusicBrainz regions that are not countries', () => {
    expect(formatCountry('XW')).toBe('Worldwide');
    expect(formatCountry('XE')).toBe('Europe');
  });

  it('returns a code it does not know as it was given', () => {
    expect(formatCountry('??')).toBe('??');
  });
});

describe('formatTrackLength', () => {
  it('writes minutes and zero-padded seconds', () => {
    expect(formatTrackLength(236)).toBe('3:56');
    expect(formatTrackLength(65)).toBe('1:05');
    expect(formatTrackLength(5)).toBe('0:05');
  });

  it('writes a long track in minutes, not hours', () => {
    expect(formatTrackLength(3725)).toBe('62:05');
  });
});
