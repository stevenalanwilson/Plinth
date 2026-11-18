import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { DeviceRepository } from '../repositories/deviceRepository';
import { createInMemoryDeviceRepository } from '../repositories/inMemoryDeviceRepository';
import {
  authenticateDevice,
  DEVICE_TOKEN_TTL_DAYS,
  hashToken,
  registerDevice,
  removeInactiveDevices,
  startDeviceCleanup,
} from './deviceService';
import { logger } from '../logger';

const NOW = new Date('2026-11-18T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function after(days: number, from: Date = NOW): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('hashToken', () => {
  it('gives the same hash for the same token and a different one for another', () => {
    expect(hashToken('a')).toBe(hashToken('a'));
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });

  it('is a SHA-256 hex digest, not the token', () => {
    expect(hashToken('a')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('a')).not.toContain('a'.repeat(8));
  });
});

describe('registerDevice', () => {
  it('returns a prefixed token of the expected length, and the device id', async () => {
    const devices = createInMemoryDeviceRepository();

    const { token, deviceId } = await registerDevice(devices, NOW);

    expect(token).toMatch(/^pld_[A-Za-z0-9_-]{43}$/);
    expect(deviceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('stores only a hash of the token', async () => {
    const devices = createInMemoryDeviceRepository();

    const { token, deviceId } = await registerDevice(devices, NOW);

    expect((await devices.findByTokenHash(hashToken(token)))?.id).toBe(deviceId);
    expect(await devices.findByTokenHash(token)).toBeNull();
  });

  it('gives every device a different token', async () => {
    const devices = createInMemoryDeviceRepository();

    const tokens = await Promise.all(
      Array.from({ length: 20 }, () => registerDevice(devices, NOW)),
    );

    expect(new Set(tokens.map((registered) => registered.token)).size).toBe(20);
  });
});

describe('authenticateDevice', () => {
  it('recognises the device a token was issued to', async () => {
    const devices = createInMemoryDeviceRepository();
    const { token, deviceId } = await registerDevice(devices, NOW);

    expect((await authenticateDevice(devices, token, after(1)))?.id).toBe(deviceId);
  });

  it('does not recognise a token that was never issued', async () => {
    const devices = createInMemoryDeviceRepository();
    const other = createInMemoryDeviceRepository();
    const { token } = await registerDevice(other, NOW);

    expect(await authenticateDevice(devices, token, NOW)).toBeNull();
  });

  it.each(['', 'not-a-token', 'pld_short', `pld_${'!'.repeat(43)}`, `xyz_${'a'.repeat(43)}`])(
    'turns away %j without looking it up',
    async (junk) => {
      const devices = createInMemoryDeviceRepository();
      const lookup = vi.spyOn(devices, 'findByTokenHash');

      expect(await authenticateDevice(devices, junk, NOW)).toBeNull();
      expect(lookup).not.toHaveBeenCalled();
    },
  );

  it('does not recognise a device unused for more than a year', async () => {
    const devices = createInMemoryDeviceRepository();
    const { token } = await registerDevice(devices, NOW);

    expect(await authenticateDevice(devices, token, after(DEVICE_TOKEN_TTL_DAYS + 1))).toBeNull();
  });

  it('still recognises a device on the last day of the year', async () => {
    const devices = createInMemoryDeviceRepository();
    const { token } = await registerDevice(devices, NOW);

    expect(await authenticateDevice(devices, token, after(DEVICE_TOKEN_TTL_DAYS))).not.toBeNull();
  });

  it('keeps a device alive by using it: the year runs from when it was last seen', async () => {
    const devices = createInMemoryDeviceRepository();
    const { token } = await registerDevice(devices, NOW);

    await authenticateDevice(devices, token, after(300));

    expect(await authenticateDevice(devices, token, after(300 + 300))).not.toBeNull();
  });

  describe('noting that a device was seen', () => {
    async function seenTimeAfter(days: number): Promise<number> {
      const devices = createInMemoryDeviceRepository();
      const { token } = await registerDevice(devices, NOW);
      await authenticateDevice(devices, token, after(days));
      return (await devices.findByTokenHash(hashToken(token)))?.lastSeenAt.getTime() ?? 0;
    }

    it('does not write on every request within a day', async () => {
      expect(await seenTimeAfter(0.5)).toBe(NOW.getTime());
    });

    it('moves the time on once a day has passed', async () => {
      expect(await seenTimeAfter(1)).toBe(after(1).getTime());
    });

    it('returns the device with its new time', async () => {
      const devices = createInMemoryDeviceRepository();
      const { token } = await registerDevice(devices, NOW);

      const device = await authenticateDevice(devices, token, after(2));

      expect(device?.lastSeenAt.getTime()).toBe(after(2).getTime());
    });
  });

  it('lets a failing repository fail the call, for the caller to decide what to do', async () => {
    const devices: DeviceRepository = {
      ...createInMemoryDeviceRepository(),
      findByTokenHash: async () => {
        throw new Error('connection refused');
      },
    };

    await expect(authenticateDevice(devices, `pld_${'a'.repeat(43)}`, NOW)).rejects.toThrow(
      'connection refused',
    );
  });
});

describe('removeInactiveDevices', () => {
  it('removes devices unused for more than a year and keeps the rest', async () => {
    const devices = createInMemoryDeviceRepository();
    const old = await registerDevice(devices, NOW);
    const recent = await registerDevice(devices, after(200));

    const removed = await removeInactiveDevices(devices, after(DEVICE_TOKEN_TTL_DAYS + 5));

    expect(removed).toBe(1);
    expect(await devices.findByTokenHash(hashToken(old.token))).toBeNull();
    expect(await devices.findByTokenHash(hashToken(recent.token))).not.toBeNull();
  });
});

describe('startDeviceCleanup', () => {
  it('removes inactive devices on a timer, and stops when told to', async () => {
    vi.useFakeTimers();
    const devices = createInMemoryDeviceRepository();
    const removal = vi.spyOn(devices, 'deleteNotSeenSince').mockResolvedValue(2);

    const stop = startDeviceCleanup(devices, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(removal).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith({ removed: 2 }, 'inactive devices removed');

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(removal).toHaveBeenCalledTimes(1);
  });

  it('says nothing when nothing was removed', async () => {
    vi.useFakeTimers();
    const devices = createInMemoryDeviceRepository();
    vi.spyOn(devices, 'deleteNotSeenSince').mockResolvedValue(0);

    startDeviceCleanup(devices, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(logger.info).not.toHaveBeenCalled();
  });

  it('logs a failed clean-up and carries on', async () => {
    vi.useFakeTimers();
    const devices = createInMemoryDeviceRepository();
    vi.spyOn(devices, 'deleteNotSeenSince').mockRejectedValue(new Error('connection refused'));

    startDeviceCleanup(devices, 1000);
    await vi.advanceTimersByTimeAsync(2000);

    expect(logger.error).toHaveBeenCalledWith(
      { error: 'connection refused' },
      'device cleanup failed',
    );
  });
});
