import { describe, it, expect } from 'vitest';
import { pillStyle } from './pillStyle';

describe('pillStyle', () => {
  it('is a small grey pill in the mono font when not chosen', () => {
    expect(pillStyle(false)).toMatchObject({
      padding: '6px 12px',
      borderRadius: 20,
      fontSize: 12,
      fontFamily: 'var(--mono)',
      background: 'var(--surface2)',
      color: 'var(--text)',
      borderColor: 'var(--border)',
    });
  });

  it('is filled with the accent colour when chosen', () => {
    expect(pillStyle(true)).toMatchObject({
      background: 'var(--accent)',
      color: '#0e0e0f',
      borderColor: 'var(--accent)',
    });
  });

  it('is the same size either way, so choosing one does not move the others', () => {
    const { background, color, borderColor, ...chosen } = pillStyle(true);
    const { background: b2, color: c2, borderColor: bc2, ...notChosen } = pillStyle(false);

    expect(chosen).toEqual(notChosen);
    expect([background, color, borderColor]).not.toEqual([b2, c2, bc2]);
  });
});
