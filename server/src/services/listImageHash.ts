import { createHash } from 'crypto';
import { AlbumResponse } from '@shared/types';

/**
 * Bumped when the picture is redesigned, so every card already shared is fetched again. It is
 * part of the hash because the hash is what the picture's address carries.
 */
const DESIGN_VERSION = '1';

type Pictured = Pick<AlbumResponse, 'releaseGroupId' | 'artworkUrl'>;

/**
 * A short code for what a list's picture shows: the albums, their order, and their covers. It goes
 * in the picture's address, so a platform that has the old picture cached asks for a new one after
 * the list changes, and keeps the one it has otherwise. A cover turning up for an album that had
 * none changes it too, since the picture would.
 */
export function listImageHash(albums: readonly Pictured[]): string {
  const hash = createHash('sha256').update(DESIGN_VERSION);
  for (const { releaseGroupId, artworkUrl } of albums) {
    // Length-prefixed, so one value can't run into the next.
    hash.update(`\n${releaseGroupId.length}:${releaseGroupId}${artworkUrl ?? ''}`);
  }
  return hash.digest('hex').slice(0, 12);
}
