import { describe, it, expect } from 'vitest';
import { FEEDBACK_STATUSES, parseFeedback } from './feedback';

const AT = '2026-11-17T20:00:00.000Z';

describe('parseFeedback', () => {
  it.each(FEEDBACK_STATUSES)('accepts the %s status', (status) => {
    expect(parseFeedback({ status, at: AT })).toEqual({ status, at: AT });
  });

  it('accepts a cleared rating, which keeps its timestamp', () => {
    expect(parseFeedback({ status: null, at: AT })).toEqual({ status: null, at: AT });
  });

  it.each([
    undefined,
    null,
    'own',
    42,
    {},
    { status: 'own' },
    { at: AT },
    { status: 'loved', at: AT },
    { status: 'own', at: 'yesterday' },
    { status: 'own', at: 12345 },
    { status: undefined, at: AT },
  ])('ignores %j', (raw) => {
    expect(parseFeedback(raw)).toBeUndefined();
  });

  it('drops extra fields', () => {
    expect(parseFeedback({ status: 'own', at: AT, note: 'signed copy' })).toEqual({
      status: 'own',
      at: AT,
    });
  });
});
