import { describe, it, expect } from 'vitest';
import { ApiError } from './apiClient';
import { toFailure } from './failure';

describe('toFailure', () => {
  it('knows when the daily picks are used up', () => {
    const failure = toFailure(new ApiError("That's all 25 picks.", 429, 'daily-limit'), 'Oops');

    expect(failure).toEqual({ message: "That's all 25 picks.", isLimitReached: true });
  });

  it('does not take any other 429 for it', () => {
    expect(toFailure(new ApiError('Too many requests', 429), 'Oops').isLimitReached).toBe(false);
  });

  it('keeps the message of an ordinary failure', () => {
    expect(toFailure(new Error('Broke'), 'Oops')).toEqual({
      message: 'Broke',
      isLimitReached: false,
    });
  });

  it('uses the fallback for something that is not an error', () => {
    expect(toFailure('x', 'Oops').message).toBe('Oops');
  });
});
