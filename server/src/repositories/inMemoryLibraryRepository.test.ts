import { randomUUID } from 'crypto';
import { describeLibraryRepository } from './libraryRepository.contract';
import { createInMemoryLibraryRepository } from './inMemoryLibraryRepository';

describeLibraryRepository('in-memory library repository', async () => ({
  library: createInMemoryLibraryRepository(),
  newAccountId: async (): Promise<string> => randomUUID(),
}));
