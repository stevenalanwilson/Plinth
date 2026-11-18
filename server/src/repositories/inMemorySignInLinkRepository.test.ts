import { describeSignInLinkRepository } from './signInLinkRepository.contract';
import { createInMemorySignInLinkRepository } from './inMemorySignInLinkRepository';

describeSignInLinkRepository('in-memory sign-in link repository', async () =>
  createInMemorySignInLinkRepository(),
);
