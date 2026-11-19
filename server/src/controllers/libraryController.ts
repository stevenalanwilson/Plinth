import { Request, Response } from 'express';
import { deviceOf } from '../middleware/deviceAuth';
import { LibraryFullError, LibraryRepository } from '../repositories/libraryRepository';
import { syncLibrary } from '../services/libraryService';
import { parseLibrarySyncRequest } from '../utils/libraryRequest';
import { logger } from '../logger';

type Handler = (req: Request, res: Response) => Promise<void>;

/** POST /library/sync: for a signed-in device; saves its changes and returns everyone else's. */
export function createLibrarySyncHandler(library: LibraryRepository): Handler {
  return async (req, res) => {
    // About one person, and private.
    res.set('Cache-Control', 'no-store');

    const accountId = deviceOf(res)?.accountId;
    // Not a 401, which the client reads as "your device token is stale".
    if (!accountId) {
      res.status(403).json({ error: "You're not signed in." });
      return;
    }

    const parsed = parseLibrarySyncRequest(req.body);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    try {
      const response = await syncLibrary(library, accountId, parsed.request);
      // Counts only: never what is in the crate.
      logger.info(
        {
          sent: parsed.request.items.length,
          removed: parsed.request.deletions.length,
          returned: response.items.length,
        },
        'library synced',
      );
      res.json(response);
    } catch (error) {
      if (error instanceof LibraryFullError) {
        logger.info('library full');
        res.status(413).json({
          error:
            'Your crate is too big to save any more to your account. Remove some albums, then try again.',
        });
        return;
      }
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'library sync failed',
      );
      res.status(500).json({ error: "Couldn't save your crate. Please try again." });
    }
  };
}
