import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceRepository } from './deviceRepository';

const NOW = new Date('2026-11-18T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAfter(days: number): Date {
  return new Date(NOW.getTime() + days * DAY_MS);
}

/** Behaviour every DeviceRepository must share, so the in-memory one is a faithful stand-in. */
export function describeDeviceRepository(
  name: string,
  createRepository: () => Promise<DeviceRepository>,
): void {
  describe(`${name} (DeviceRepository contract)`, () => {
    let devices: DeviceRepository;

    beforeEach(async () => {
      devices = await createRepository();
    });

    it('stores a device and finds it by the hash of its token', async () => {
      const created = await devices.create('hash-a', NOW);

      const found = await devices.findByTokenHash('hash-a');

      expect(found?.id).toBe(created.id);
      expect(created.createdAt.getTime()).toBe(NOW.getTime());
      expect(created.lastSeenAt.getTime()).toBe(NOW.getTime());
    });

    it('returns null for a hash it does not have', async () => {
      expect(await devices.findByTokenHash('nope')).toBeNull();
    });

    it('gives each device its own id', async () => {
      const first = await devices.create('hash-a', NOW);
      const second = await devices.create('hash-b', NOW);

      expect(second.id).not.toBe(first.id);
    });

    it('rejects a hash that is already stored', async () => {
      await devices.create('hash-a', NOW);

      await expect(devices.create('hash-a', NOW)).rejects.toThrow();
    });

    it('records when a device was last seen, leaving when it was created alone', async () => {
      const { id } = await devices.create('hash-a', NOW);

      await devices.markSeen(id, daysAfter(3));

      const found = await devices.findByTokenHash('hash-a');
      expect(found?.lastSeenAt.getTime()).toBe(daysAfter(3).getTime());
      expect(found?.createdAt.getTime()).toBe(NOW.getTime());
    });

    it('only marks the device it is asked about', async () => {
      const first = await devices.create('hash-a', NOW);
      await devices.create('hash-b', NOW);

      await devices.markSeen(first.id, daysAfter(3));

      expect((await devices.findByTokenHash('hash-b'))?.lastSeenAt.getTime()).toBe(NOW.getTime());
    });

    it('does nothing when marking a device it does not have', async () => {
      await expect(
        devices.markSeen('00000000-0000-4000-8000-000000000000', NOW),
      ).resolves.toBeUndefined();
    });

    it('removes devices last seen before the cutoff, and only those', async () => {
      await devices.create('old', NOW);
      const recent = await devices.create('recent', NOW);
      await devices.markSeen(recent.id, daysAfter(10));

      const removed = await devices.deleteNotSeenSince(daysAfter(5));

      expect(removed).toBe(1);
      expect(await devices.findByTokenHash('old')).toBeNull();
      expect(await devices.findByTokenHash('recent')).not.toBeNull();
    });

    it('keeps a device seen exactly at the cutoff', async () => {
      await devices.create('edge', NOW);

      expect(await devices.deleteNotSeenSince(NOW)).toBe(0);
      expect(await devices.findByTokenHash('edge')).not.toBeNull();
    });

    it('removes nothing when nothing is old enough', async () => {
      await devices.create('hash-a', NOW);

      expect(await devices.deleteNotSeenSince(daysAfter(-1))).toBe(0);
    });
  });
}
