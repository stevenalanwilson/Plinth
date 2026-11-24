import { Request, Response } from 'express';
import { ListResponse, ListsResponse } from '@shared/types';
import { deviceOf } from '../middleware/deviceAuth';
import { ListExistsError, ListOwner } from '../repositories/listRepository';
import { createListSchema, listIdSchema, replaceListSchema } from '../schemas/listSchemas';
import {
  AlbumLookupUnavailableError,
  createList,
  deleteList,
  getList,
  getOwnLists,
  InvalidListError,
  ListDependencies,
  replaceListAlbums,
  UnknownAlbumError,
} from '../services/listService';
import { logger } from '../logger';

type Handler = (req: Request, res: Response) => Promise<void>;

export interface ListHandlers {
  readonly mine: Handler;
  readonly create: Handler;
  readonly read: Handler;
  readonly replace: Handler;
  readonly remove: Handler;
  readonly shared: Handler;
}

// A list is about one person, and what it holds can change at any moment.
function noStore(res: Response): void {
  res.set('Cache-Control', 'no-store');
}

/** The account a device is signed in to owns its lists; otherwise the device does. */
function ownerOf(res: Response): ListOwner | null {
  const device = deviceOf(res);
  if (!device) return null;
  return device.accountId
    ? { kind: 'account', id: device.accountId }
    : { kind: 'device', id: device.id };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * What a log line says about a list: how many albums it has, never which list or whose, since a
 * list's code is what lets someone in and the logs are read by more people than that.
 */
function summary(list: ListResponse): {
  readonly kind: string;
  readonly qualifier: string;
  readonly albumCount: number;
  readonly isFull: boolean;
} {
  return {
    kind: list.kind,
    qualifier: list.qualifier,
    albumCount: list.albums.length,
    isFull: list.albums.length >= list.size,
  };
}

const NEEDS_DEVICE = "This browser can't keep lists. Check that it allows this site to store data.";

/**
 * Answers for the errors a request can cause. Anything else is logged and answered with a 500,
 * so nothing about the server leaks out.
 */
function answerError(res: Response, error: unknown, what: string): void {
  if (error instanceof UnknownAlbumError) {
    res.status(422).json({ error: "One of those albums couldn't be found." });
  } else if (error instanceof AlbumLookupUnavailableError) {
    res.status(503).json({ error: "Albums can't be looked up right now. Please try again." });
  } else if (error instanceof InvalidListError) {
    res.status(400).json({ error: error.message });
  } else if (error instanceof ListExistsError) {
    res.status(409).json({ error: 'You already have a list of that kind.' });
  } else {
    logger.error({ error: describeError(error) }, `${what} failed`);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

export function createListHandlers(deps: ListDependencies): ListHandlers {
  return {
    async mine(_req: Request, res: Response): Promise<void> {
      noStore(res);
      const owner = ownerOf(res);
      try {
        const body: ListsResponse = { lists: owner ? await getOwnLists(deps, owner) : [] };
        res.json(body);
      } catch (error) {
        answerError(res, error, 'list lookup');
      }
    },

    async create(req: Request, res: Response): Promise<void> {
      noStore(res);
      const owner = ownerOf(res);
      if (!owner) {
        // Not a 401, which the client reads as "your device token is stale".
        res.status(403).json({ error: NEEDS_DEVICE });
        return;
      }
      const input = createListSchema.safeParse(req.body);
      if (!input.success) {
        res.status(400).json({
          error: 'kind, qualifier and releaseGroupIds are needed, and releaseGroupIds are IDs',
        });
        return;
      }

      try {
        const body: ListResponse = await createList(deps, owner, input.data);
        logger.info(summary(body), 'list created');
        res.status(201).json(body);
      } catch (error) {
        answerError(res, error, 'list creation');
      }
    },

    async read(req: Request, res: Response): Promise<void> {
      noStore(res);
      const id = listIdSchema.safeParse(req.params.id);
      if (!id.success) {
        res.status(404).json({ error: 'List not found' });
        return;
      }

      try {
        const list = await getList(deps, ownerOf(res), id.data);
        if (!list) {
          res.status(404).json({ error: 'List not found' });
          return;
        }
        res.json(list);
      } catch (error) {
        answerError(res, error, 'list lookup');
      }
    },

    async replace(req: Request, res: Response): Promise<void> {
      noStore(res);
      const owner = ownerOf(res);
      const id = listIdSchema.safeParse(req.params.id);
      // The same answer for a list that isn't there and one that isn't theirs, so a code can't
      // be used to find out which lists exist.
      if (!owner || !id.success) {
        res.status(404).json({ error: 'List not found' });
        return;
      }
      const input = replaceListSchema.safeParse(req.body);
      if (!input.success) {
        res.status(400).json({ error: 'releaseGroupIds must be a list of album IDs' });
        return;
      }

      try {
        const list = await replaceListAlbums(deps, owner, id.data, input.data.releaseGroupIds);
        if (!list) {
          res.status(404).json({ error: 'List not found' });
          return;
        }
        logger.info(summary(list), 'list edited');
        res.json(list);
      } catch (error) {
        answerError(res, error, 'list change');
      }
    },

    async remove(req: Request, res: Response): Promise<void> {
      noStore(res);
      const owner = ownerOf(res);
      const id = listIdSchema.safeParse(req.params.id);
      if (!owner || !id.success) {
        res.status(404).json({ error: 'List not found' });
        return;
      }

      try {
        if (!(await deleteList(deps, owner, id.data))) {
          res.status(404).json({ error: 'List not found' });
          return;
        }
        logger.info({}, 'list deleted');
        res.status(204).end();
      } catch (error) {
        answerError(res, error, 'list deletion');
      }
    },

    // A tap on Share. Nothing is shared by the server, which is only told, so that the logs can
    // say how many lists are passed on. It also says whether the list's own owner did, and the
    // list must be one that could be shared: finished, and visible to whoever is asking.
    async shared(req: Request, res: Response): Promise<void> {
      noStore(res);
      const id = listIdSchema.safeParse(req.params.id);
      if (!id.success) {
        res.status(404).json({ error: 'List not found' });
        return;
      }

      try {
        const list = await getList(deps, ownerOf(res), id.data);
        if (!list || list.albums.length < list.size) {
          res.status(404).json({ error: 'List not found' });
          return;
        }
        logger.info({ isOwner: list.isOwner, qualifier: list.qualifier }, 'list shared');
        res.status(204).end();
      } catch (error) {
        answerError(res, error, 'list share');
      }
    },
  };
}
