import { randomUUID } from 'crypto';
import { describeListRepository } from './listRepository.contract';
import { createInMemoryListRepository } from './inMemoryListRepository';

describeListRepository('In-memory list repository', async () => {
  // Anything that isn't a stored album is turned away, as Postgres does.
  const albumIds = new Set<string>();
  return {
    lists: createInMemoryListRepository({ hasAlbum: (id) => albumIds.has(id) }),
    newDeviceId: async (): Promise<string> => randomUUID(),
    newAccountId: async (): Promise<string> => randomUUID(),
    newAlbumId: async (): Promise<string> => {
      const id = randomUUID();
      albumIds.add(id);
      return id;
    },
  };
});
