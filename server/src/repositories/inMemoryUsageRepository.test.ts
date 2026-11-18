import { describeUsageRepository } from './usageRepository.contract';
import { createInMemoryUsageRepository } from './inMemoryUsageRepository';

describeUsageRepository('in-memory usage repository', async () => createInMemoryUsageRepository());
