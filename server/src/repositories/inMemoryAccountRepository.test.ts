import { describeAccountRepository } from './accountRepository.contract';
import { createInMemoryAccountRepository } from './inMemoryAccountRepository';

describeAccountRepository('in-memory account repository', async () =>
  createInMemoryAccountRepository(),
);
