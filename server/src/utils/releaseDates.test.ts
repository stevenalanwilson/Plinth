import { describe, it, expect } from 'vitest';
import { sortableDate } from './releaseDates';

describe('sortableDate', () => {
  it('keeps a full date as it is', () => {
    expect(sortableDate('1980-11-21')).toBe('1980-11-21');
  });

  it('sorts a year and month as the end of that month', () => {
    expect(sortableDate('1980-11')).toBe('1980-11-99');
  });

  it('sorts a year alone as the end of that year', () => {
    expect(sortableDate('1980')).toBe('1980-99-99');
    expect(sortableDate('1980').localeCompare(sortableDate('1980-11'))).toBeGreaterThan(0);
  });

  it('sorts a missing date after every real one', () => {
    expect(sortableDate(undefined)).toBe('9999-99-99');
    expect(sortableDate('')).toBe('9999-99-99');
  });
});
