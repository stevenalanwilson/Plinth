import { Request, Response } from 'express';
import { DeviceRegistrationResponse } from '@shared/types';
import { DeviceRepository } from '../repositories/deviceRepository';
import { registerDevice } from '../services/deviceService';
import { logger } from '../logger';

export function createRegisterDeviceHandler(
  devices: DeviceRepository,
): (req: Request, res: Response) => Promise<void> {
  return async (_req, res) => {
    try {
      const { token } = await registerDevice(devices);
      const body: DeviceRegistrationResponse = { token };
      // The token is shown once, so it must never be kept by a cache.
      res.set('Cache-Control', 'no-store');
      res.status(201).json(body);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'device registration failed',
      );
      res.status(500).json({ error: 'Failed to register this device.' });
    }
  };
}
