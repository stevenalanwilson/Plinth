import { createInMemoryAccountRepository } from '../repositories/inMemoryAccountRepository';
import { createInMemorySignInLinkRepository } from '../repositories/inMemorySignInLinkRepository';
import { createInMemoryLibraryRepository } from '../repositories/inMemoryLibraryRepository';
import { createInMemoryListRepository } from '../repositories/inMemoryListRepository';
import { LibraryRepository } from '../repositories/libraryRepository';
import { ListRepository } from '../repositories/listRepository';
import { AccountRepository } from '../repositories/accountRepository';
import { SignInLinkRepository } from '../repositories/signInLinkRepository';
import { SignInChannel } from '../utils/signInChannel';

/** What the app needs for accounts and their lists, in memory and with sign-in off, for tests about something else. */
export function inMemoryAuth(): {
  accounts: AccountRepository;
  signInLinks: SignInLinkRepository;
  library: LibraryRepository;
  lists: ListRepository;
  signInChannel: SignInChannel | null;
} {
  return {
    accounts: createInMemoryAccountRepository(),
    signInLinks: createInMemorySignInLinkRepository(),
    library: createInMemoryLibraryRepository(),
    lists: createInMemoryListRepository(),
    signInChannel: null,
  };
}
