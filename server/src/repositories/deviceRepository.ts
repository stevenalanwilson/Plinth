export interface Device {
  readonly id: string;
  readonly createdAt: Date;
  /** When the device last made a request, to the nearest day: see deviceService. */
  readonly lastSeenAt: Date;
}

/**
 * Devices that have asked for a token. Times are passed in, not read from the clock, so expiry
 * can be tested without waiting. Only a hash of each token is ever stored.
 */
export interface DeviceRepository {
  /** Stores a new device under the hash of its token. Rejects if the hash is already stored. */
  create(tokenHash: string, now: Date): Promise<Device>;
  findByTokenHash(tokenHash: string): Promise<Device | null>;
  /** Records that the device was seen at `now`. Does nothing for a device that isn't stored. */
  markSeen(id: string, now: Date): Promise<void>;
  /** Removes devices last seen before `cutoff` and returns how many it removed. */
  deleteNotSeenSince(cutoff: Date): Promise<number>;
}
