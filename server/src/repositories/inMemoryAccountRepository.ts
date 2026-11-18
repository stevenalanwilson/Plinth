import { randomUUID } from 'crypto';
import { Account, AccountLookup, AccountRepository } from './accountRepository';

/** For tests and for local development without a database; everything is lost on restart. */
export function createInMemoryAccountRepository(): AccountRepository {
  const byEmail = new Map<string, Account>();

  return {
    async findOrCreateByEmail(email: string, now: Date): Promise<AccountLookup> {
      const existing = byEmail.get(email);
      if (existing) return { account: existing, created: false };
      const account: Account = { id: randomUUID(), email, createdAt: now };
      byEmail.set(email, account);
      return { account, created: true };
    },

    async findById(id: string): Promise<Account | null> {
      for (const account of byEmail.values()) if (account.id === id) return account;
      return null;
    },

    async delete(id: string): Promise<boolean> {
      for (const [email, account] of byEmail) {
        if (account.id === id) {
          byEmail.delete(email);
          return true;
        }
      }
      return false;
    },
  };
}
