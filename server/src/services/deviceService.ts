import { createHash, randomBytes } from 'crypto';
import { Device, DeviceRepository } from '../repositories/deviceRepository';
import { logger } from '../logger';

/** A device not seen for this long stops being recognised, and is removed. */
export const DEVICE_TOKEN_TTL_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;
// The prefix makes a leaked token easy to recognise and to scan for.
const TOKEN_PREFIX = 'pld_';
// 32 random bytes written as base64url are 43 characters.
const TOKEN_FORMAT = /^pld_[A-Za-z0-9_-]{43}$/;
// A device's last-seen time is only moved on about once a day, so ordinary use doesn't write to
// the database on every request.
const SEEN_UPDATE_INTERVAL_MS = DAY_MS;
const CLEANUP_INTERVAL_MS = DAY_MS;

/** Tokens are random and long, so a plain hash is enough: there is nothing to guess or salt. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export interface RegisteredDevice {
  /** The secret, which only exists in this result: the server keeps a hash. */
  readonly token: string;
  readonly deviceId: string;
}

/** Makes a new device and its token. */
export async function registerDevice(
  devices: DeviceRepository,
  now: Date = new Date(),
): Promise<RegisteredDevice> {
  const token = generateToken();
  const device = await devices.create(hashToken(token), now);
  return { token, deviceId: device.id };
}

/**
 * The device a token belongs to, or null if it isn't one, has never been issued, or hasn't been
 * used for a year. Using it counts as being seen, which keeps it alive.
 */
export async function authenticateDevice(
  devices: DeviceRepository,
  token: string,
  now: Date = new Date(),
): Promise<Device | null> {
  // Junk is turned away without a database lookup.
  if (!TOKEN_FORMAT.test(token)) return null;

  const device = await devices.findByTokenHash(hashToken(token));
  if (!device) return null;

  const idleMs = now.getTime() - device.lastSeenAt.getTime();
  if (idleMs > DEVICE_TOKEN_TTL_DAYS * DAY_MS) return null;

  if (idleMs >= SEEN_UPDATE_INTERVAL_MS) {
    await devices.markSeen(device.id, now);
    return { ...device, lastSeenAt: now };
  }
  return device;
}

/** Removes devices that have gone unused for a year and returns how many. */
export function removeInactiveDevices(
  devices: DeviceRepository,
  now: Date = new Date(),
): Promise<number> {
  return devices.deleteNotSeenSince(new Date(now.getTime() - DEVICE_TOKEN_TTL_DAYS * DAY_MS));
}

/** Removes unused devices once a day, so the table doesn't grow without bound. */
export function startDeviceCleanup(
  devices: DeviceRepository,
  intervalMs: number = CLEANUP_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    removeInactiveDevices(devices)
      .then((removed) => {
        if (removed > 0) logger.info({ removed }, 'inactive devices removed');
      })
      .catch((error: unknown) => {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'device cleanup failed',
        );
      });
  }, intervalMs);
  // The timer must not keep the process alive on its own.
  timer.unref();
  return () => clearInterval(timer);
}
