import { describe, it, expect } from 'vitest';
import {
  dailyPickLimits,
  DEFAULT_DAILY_PICK_LIMIT,
  DEFAULT_DAILY_SIGNED_IN_PICK_LIMIT,
  DEFAULT_GLOBAL_DAILY_PICK_LIMIT,
} from './dailyLimits';

describe('dailyPickLimits', () => {
  it('uses the defaults when nothing is set', () => {
    expect(dailyPickLimits({})).toEqual({
      perVisitor: DEFAULT_DAILY_PICK_LIMIT,
      perAccount: DEFAULT_DAILY_SIGNED_IN_PICK_LIMIT,
      global: DEFAULT_GLOBAL_DAILY_PICK_LIMIT,
    });
  });

  it('uses what is set, for each limit on its own', () => {
    expect(dailyPickLimits({ DAILY_PICK_LIMIT: '40' })).toMatchObject({
      perVisitor: 40,
      perAccount: DEFAULT_DAILY_SIGNED_IN_PICK_LIMIT,
      global: DEFAULT_GLOBAL_DAILY_PICK_LIMIT,
    });
    expect(dailyPickLimits({ DAILY_SIGNED_IN_PICK_LIMIT: '250' })).toMatchObject({
      perVisitor: DEFAULT_DAILY_PICK_LIMIT,
      perAccount: 250,
    });
    expect(dailyPickLimits({ GLOBAL_DAILY_PICK_LIMIT: '300' })).toMatchObject({
      perVisitor: DEFAULT_DAILY_PICK_LIMIT,
      global: 300,
    });
  });

  it('allows zero, which pauses picks', () => {
    expect(dailyPickLimits({ GLOBAL_DAILY_PICK_LIMIT: '0' }).global).toBe(0);
    expect(dailyPickLimits({ DAILY_PICK_LIMIT: '0' }).perVisitor).toBe(0);
    expect(dailyPickLimits({ DAILY_SIGNED_IN_PICK_LIMIT: '0' }).perAccount).toBe(0);
  });

  it('ignores whitespace, and treats a blank value as unset', () => {
    expect(dailyPickLimits({ DAILY_PICK_LIMIT: ' 10 ' }).perVisitor).toBe(10);
    expect(dailyPickLimits({ DAILY_PICK_LIMIT: '   ' }).perVisitor).toBe(DEFAULT_DAILY_PICK_LIMIT);
    expect(dailyPickLimits({ GLOBAL_DAILY_PICK_LIMIT: '' }).global).toBe(
      DEFAULT_GLOBAL_DAILY_PICK_LIMIT,
    );
  });

  it.each(['many', '-1', '2.5', '1e3', '10 picks', 'Infinity'])(
    'refuses %s rather than guessing',
    (value) => {
      expect(() => dailyPickLimits({ DAILY_PICK_LIMIT: value })).toThrow(/DAILY_PICK_LIMIT/);
      expect(() => dailyPickLimits({ DAILY_SIGNED_IN_PICK_LIMIT: value })).toThrow(
        /DAILY_SIGNED_IN_PICK_LIMIT/,
      );
      expect(() => dailyPickLimits({ GLOBAL_DAILY_PICK_LIMIT: value })).toThrow(
        /GLOBAL_DAILY_PICK_LIMIT/,
      );
    },
  );
});
