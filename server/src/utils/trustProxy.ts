interface ProxyEnvironment {
  readonly TRUST_PROXY?: string;
  readonly NODE_ENV?: string;
}

/**
 * How many proxies sit between visitors and this server, which tells Express whose address to
 * believe in X-Forwarded-For. Too low and every visitor looks like the proxy, so rate limits are
 * shared by everyone; too high and a visitor can write their own address into the header and
 * dodge them. In production the app runs on Railway, one proxy away; elsewhere there is none.
 * TRUST_PROXY overrides that, and anything but a whole number is refused: "true" in particular
 * would trust any address at all.
 */
export function trustProxyHops(env: ProxyEnvironment): number {
  const configured = env.TRUST_PROXY?.trim();
  if (!configured) return env.NODE_ENV === 'production' ? 1 : 0;

  if (!/^\d+$/.test(configured)) {
    throw new Error(
      `TRUST_PROXY must be the number of proxies in front of the app (0 for none), not "${env.TRUST_PROXY}"`,
    );
  }
  return Number(configured);
}
