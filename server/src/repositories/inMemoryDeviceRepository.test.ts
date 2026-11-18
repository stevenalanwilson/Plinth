import { describeDeviceRepository } from './deviceRepository.contract';
import { createInMemoryDeviceRepository } from './inMemoryDeviceRepository';

describeDeviceRepository('in-memory device repository', async () =>
  createInMemoryDeviceRepository(),
);
