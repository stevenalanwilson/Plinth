import { NewSignInLink, SignInLinkRepository } from './signInLinkRepository';

interface StoredLink extends NewSignInLink {
  usedAt: Date | null;
}

/** For tests and for local development without a database; everything is lost on restart. */
export function createInMemorySignInLinkRepository(): SignInLinkRepository {
  const links = new Map<string, StoredLink>();

  return {
    async create(link: NewSignInLink): Promise<void> {
      // Mirrors the primary key on sign_in_links.token_hash.
      if (links.has(link.tokenHash)) throw new Error('Token hash already in use');
      links.set(link.tokenHash, { ...link, usedAt: null });
    },

    async consume(tokenHash: string, now: Date): Promise<string | null> {
      const link = links.get(tokenHash);
      if (!link || link.usedAt !== null || link.expiresAt <= now) return null;
      link.usedAt = now;
      return link.email;
    },

    async countCreatedSince(email: string, since: Date): Promise<number> {
      let count = 0;
      for (const link of links.values()) {
        if (link.email === email && link.createdAt >= since) count++;
      }
      return count;
    },

    async deleteByTokenHash(tokenHash: string): Promise<void> {
      links.delete(tokenHash);
    },

    async deleteForEmail(email: string): Promise<number> {
      let removed = 0;
      for (const [tokenHash, link] of links) {
        if (link.email === email) {
          links.delete(tokenHash);
          removed++;
        }
      }
      return removed;
    },

    async deleteExpiredBefore(cutoff: Date): Promise<number> {
      let removed = 0;
      for (const [tokenHash, link] of links) {
        if (link.expiresAt < cutoff) {
          links.delete(tokenHash);
          removed++;
        }
      }
      return removed;
    },
  };
}
