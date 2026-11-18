import { randomUUID } from 'crypto';
import { describeDeviceRepository } from './deviceRepository.contract';
import { createInMemoryDeviceRepository } from './inMemoryDeviceRepository';

describeDeviceRepository('in-memory device repository', async () => ({
  devices: createInMemoryDeviceRepository(),
  newAccountId: async (): Promise<string> => randomUUID(),
}));
