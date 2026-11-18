import { describe, it, expect, beforeEach } from 'vitest';
import { AccountRepository } from './accountRepository';

const NOW = new Date('2026-11-18T12:00:00.000Z');

/** Behaviour every AccountRepository must share, so the in-memory one is a faithful stand-in. */
export function describeAccountRepository(
  name: string,
  createRepository: () => Promise<AccountRepository>,
): void {
  describe(`${name} (AccountRepository contract)`, () => {
    let accounts: AccountRepository;

    beforeEach(async () => {
      accounts = await createRepository();
    });

    it('makes an account for a new email, and says it did', async () => {
      const { account, created } = await accounts.findOrCreateByEmail('a@example.com', NOW);

      expect(created).toBe(true);
      expect(account.email).toBe('a@example.com');
      expect(account.createdAt.getTime()).toBe(NOW.getTime());
    });

    it('finds the same account for an email it has, and says it did not make one', async () => {
      const first = await accounts.findOrCreateByEmail('a@example.com', NOW);

      const again = await accounts.findOrCreateByEmail('a@example.com', new Date());

      expect(again.created).toBe(false);
      expect(again.account.id).toBe(first.account.id);
      expect(again.account.createdAt.getTime()).toBe(NOW.getTime());
    });

    it('gives each email its own account', async () => {
      const first = await accounts.findOrCreateByEmail('a@example.com', NOW);
      const second = await accounts.findOrCreateByEmail('b@example.com', NOW);

      expect(second.account.id).not.toBe(first.account.id);
    });

    it('makes one account when two sign-ins for a new email arrive together', async () => {
      const results = await Promise.all([
        accounts.findOrCreateByEmail('a@example.com', NOW),
        accounts.findOrCreateByEmail('a@example.com', NOW),
        accounts.findOrCreateByEmail('a@example.com', NOW),
      ]);

      expect(new Set(results.map((result) => result.account.id)).size).toBe(1);
      expect(results.filter((result) => result.created)).toHaveLength(1);
    });

    it('finds an account by id', async () => {
      const { account } = await accounts.findOrCreateByEmail('a@example.com', NOW);

      expect(await accounts.findById(account.id)).toEqual(account);
    });

    it('returns null for an id it does not have', async () => {
      expect(await accounts.findById('11111111-1111-4111-8111-111111111111')).toBeNull();
    });

    it('deletes an account, so its email can start again as new', async () => {
      const { account } = await accounts.findOrCreateByEmail('a@example.com', NOW);

      expect(await accounts.delete(account.id)).toBe(true);

      expect(await accounts.findById(account.id)).toBeNull();
      const again = await accounts.findOrCreateByEmail('a@example.com', NOW);
      expect(again.created).toBe(true);
      expect(again.account.id).not.toBe(account.id);
    });

    it('says so when there is no account to delete, and leaves the others', async () => {
      const { account } = await accounts.findOrCreateByEmail('a@example.com', NOW);

      expect(await accounts.delete('11111111-1111-4111-8111-111111111111')).toBe(false);

      expect(await accounts.findById(account.id)).not.toBeNull();
    });
  });
}
