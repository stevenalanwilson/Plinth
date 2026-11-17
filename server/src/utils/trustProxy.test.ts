import { describe, it, expect } from 'vitest';
import { trustProxyHops } from './trustProxy';

describe('trustProxyHops', () => {
  it('trusts no proxy in development, where nothing sits in front of the app', () => {
    expect(trustProxyHops({})).toBe(0);
    expect(trustProxyHops({ NODE_ENV: 'development' })).toBe(0);
  });

  it('trusts the one proxy in front of the app in production, as on Railway', () => {
    expect(trustProxyHops({ NODE_ENV: 'production' })).toBe(1);
  });

  it('uses TRUST_PROXY when it is set, in any environment', () => {
    expect(trustProxyHops({ TRUST_PROXY: '2', NODE_ENV: 'production' })).toBe(2);
    expect(trustProxyHops({ TRUST_PROXY: '1' })).toBe(1);
  });

  it('lets production be told there is no proxy', () => {
    expect(trustProxyHops({ TRUST_PROXY: '0', NODE_ENV: 'production' })).toBe(0);
  });

  it('ignores whitespace, and treats a blank value as unset', () => {
    expect(trustProxyHops({ TRUST_PROXY: ' 1 ' })).toBe(1);
    expect(trustProxyHops({ TRUST_PROXY: '   ', NODE_ENV: 'production' })).toBe(1);
    expect(trustProxyHops({ TRUST_PROXY: '' })).toBe(0);
  });

  it.each(['true', 'false', '-1', '1.5', 'one', '1,2', '10.0.0.0/8'])(
    'refuses %s, which is not a number of proxies, rather than guessing',
    (value) => {
      expect(() => trustProxyHops({ TRUST_PROXY: value })).toThrow(
        `TRUST_PROXY must be the number of proxies in front of the app (0 for none), not "${value}"`,
      );
    },
  );
});
