import { RequestHandler, Response } from 'express';
import { Device, DeviceRepository } from '../repositories/deviceRepository';
import { authenticateDevice } from '../services/deviceService';
import { logger } from '../logger';

const BEARER = /^Bearer\s+(\S+)$/i;
const DEVICE_KEY = 'device';

/**
 * Recognises the device a request comes from, when it says. No Authorization header means an
 * anonymous request and is fine. A token that is present but wrong or expired is refused with 401
 * so the client knows to ask for a new one, rather than quietly carrying on as someone else.
 */
export function createDeviceAuth(devices: DeviceRepository): RequestHandler {
  return async (req, res, next) => {
    const header = req.get('authorization');
    if (header === undefined) {
      next();
      return;
    }

    const token = BEARER.exec(header)?.[1];
    if (!token) {
      res.status(401).json({ error: 'Invalid or expired device token.' });
      return;
    }

    try {
      const device = await authenticateDevice(devices, token);
      if (!device) {
        res.status(401).json({ error: 'Invalid or expired device token.' });
        return;
      }
      res.locals[DEVICE_KEY] = device;
    } catch (error) {
      // A database problem shouldn't stop a pick: the request carries on as one with no device,
      // which the daily limit counts by address instead.
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'device lookup failed',
      );
    }
    next();
  };
}

/** The device that made this request, or null for an anonymous one. */
export function deviceOf(res: Response): Device | null {
  return (res.locals[DEVICE_KEY] as Device | undefined) ?? null;
}
