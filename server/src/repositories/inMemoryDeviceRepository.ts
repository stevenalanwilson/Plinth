import { randomUUID } from 'crypto';
import { Device, DeviceRepository } from './deviceRepository';

/** For tests and for local development without a database; everything is lost on restart. */
export function createInMemoryDeviceRepository(): DeviceRepository {
  const byTokenHash = new Map<string, Device>();

  return {
    async create(tokenHash: string, now: Date): Promise<Device> {
      // Mirrors the unique constraint on devices.token_hash.
      if (byTokenHash.has(tokenHash)) throw new Error('Token hash already in use');
      const device: Device = { id: randomUUID(), createdAt: now, lastSeenAt: now, accountId: null };
      byTokenHash.set(tokenHash, device);
      return device;
    },

    async findByTokenHash(tokenHash: string): Promise<Device | null> {
      return byTokenHash.get(tokenHash) ?? null;
    },

    async markSeen(id: string, now: Date): Promise<void> {
      for (const [tokenHash, device] of byTokenHash) {
        if (device.id === id) byTokenHash.set(tokenHash, { ...device, lastSeenAt: now });
      }
    },

    async linkToAccount(id: string, accountId: string): Promise<void> {
      for (const [tokenHash, device] of byTokenHash) {
        if (device.id === id) byTokenHash.set(tokenHash, { ...device, accountId });
      }
    },

    async unlinkFromAccount(id: string): Promise<void> {
      for (const [tokenHash, device] of byTokenHash) {
        if (device.id === id) byTokenHash.set(tokenHash, { ...device, accountId: null });
      }
    },

    async unlinkAllFromAccount(accountId: string): Promise<number> {
      let unlinked = 0;
      for (const [tokenHash, device] of byTokenHash) {
        if (device.accountId === accountId) {
          byTokenHash.set(tokenHash, { ...device, accountId: null });
          unlinked++;
        }
      }
      return unlinked;
    },

    async deleteNotSeenSince(cutoff: Date): Promise<number> {
      let removed = 0;
      for (const [tokenHash, device] of byTokenHash) {
        if (device.lastSeenAt < cutoff) {
          byTokenHash.delete(tokenHash);
          removed++;
        }
      }
      return removed;
    },
  };
}
