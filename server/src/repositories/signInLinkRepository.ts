export interface NewSignInLink {
  readonly tokenHash: string;
  readonly email: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

/**
 * Links emailed to people so they can sign in. Only a hash of each token is stored. Times are
 * passed in, not read from the clock, so expiry can be tested without waiting.
 */
export interface SignInLinkRepository {
  create(link: NewSignInLink): Promise<void>;
  /**
   * Uses a link up, returning the email it was sent to, or null if there is no such link, it
   * has already been used, or it has expired. Two requests at once for one link: one wins.
   */
  consume(tokenHash: string, now: Date): Promise<string | null>;
  /** How many links have been made for the email since then, whether or not they were used. */
  countCreatedSince(email: string, since: Date): Promise<number>;
  /** Removes one link, for one that was made but never delivered. */
  deleteByTokenHash(tokenHash: string): Promise<void>;
  /** Removes every link made for the email, returning how many. */
  deleteForEmail(email: string): Promise<number>;
  /** Removes links that expired before the cutoff, returning how many. */
  deleteExpiredBefore(cutoff: Date): Promise<number>;
}
