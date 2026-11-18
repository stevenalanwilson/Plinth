import { createInMemoryAccountRepository } from '../repositories/inMemoryAccountRepository';
import { createInMemorySignInLinkRepository } from '../repositories/inMemorySignInLinkRepository';
import { AccountRepository } from '../repositories/accountRepository';
import { SignInLinkRepository } from '../repositories/signInLinkRepository';
import { SignInChannel } from '../utils/signInChannel';

/** What the app needs for sign-in, in memory and switched off, for tests about something else. */
export function inMemoryAuth(): {
  accounts: AccountRepository;
  signInLinks: SignInLinkRepository;
  signInChannel: SignInChannel | null;
} {
  return {
    accounts: createInMemoryAccountRepository(),
    signInLinks: createInMemorySignInLinkRepository(),
    signInChannel: null,
  };
}
