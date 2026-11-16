import { describeAlbumRepository } from './albumRepository.contract';
import { createInMemoryAlbumRepository } from './inMemoryAlbumRepository';

describeAlbumRepository('in-memory album repository', async () => createInMemoryAlbumRepository());
