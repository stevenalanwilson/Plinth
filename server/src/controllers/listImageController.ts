import { Request, Response } from 'express';
import { AlbumResponse } from '@shared/types';
import { AlbumRepository } from '../repositories/albumRepository';
import { ListRepository } from '../repositories/listRepository';
import { listIdSchema } from '../schemas/listSchemas';
import { fetchImageBytes, ImageResult } from '../services/imageProxyService';
import { listImageHash } from '../services/listImageHash';
import {
  LIST_IMAGE_CONTENT_TYPE,
  ListImageContent,
  ListImageCover,
  renderListImage,
} from '../services/listImageService';
import { getList } from '../services/listService';
import { logger } from '../logger';

interface ListImageDependencies {
  readonly lists: ListRepository;
  readonly albums: AlbumRepository;
  /** Draws the picture; the real renderer unless a test supplies its own. */
  readonly renderImage?: (content: ListImageContent) => Promise<Buffer>;
  /** Fetches a cover's bytes, from the hosts the cover proxy trusts. */
  readonly fetchCover?: (url: string) => Promise<ImageResult>;
  /** How many pictures are kept to be served again; about 130 KB each. */
  readonly maxCachedImages?: number;
}

const DEFAULT_MAX_CACHED_IMAGES = 40;
// The address carries the list's hash, so what is there never changes and may be kept for good.
const KEEP_FOR_A_YEAR = 'public, max-age=31536000, immutable';
const DEFAULT_CARD = '/og-default.png';

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Serves the picture of a list that is shown when its link is shared: the three covers in order.
 * Its address carries a hash of what it shows, so a platform that has an old picture cached asks
 * for a new one after the list changes. A request with no hash, or an old one, is sent to the
 * current address, so a card shared long ago still shows the list as it is now.
 *
 * Pictures are kept in memory by hash, so one drawing serves every list that looks the same and
 * every request for it, and asking for the same one at once draws it once. If a picture can't be
 * drawn the answer is the Plinth card, which isn't kept, so the next request tries again.
 */
export function createListImageHandler({
  lists,
  albums,
  renderImage = renderListImage,
  fetchCover = fetchImageBytes,
  maxCachedImages = DEFAULT_MAX_CACHED_IMAGES,
}: ListImageDependencies): (req: Request, res: Response) => Promise<void> {
  // A Map keeps the order things were added in, so the first key is the one used least recently.
  const kept = new Map<string, Buffer>();
  const drawing = new Map<string, Promise<Buffer>>();

  function keep(hash: string, picture: Buffer): void {
    kept.delete(hash);
    kept.set(hash, picture);
    while (kept.size > maxCachedImages) {
      const oldest = kept.keys().next().value as string;
      kept.delete(oldest);
    }
  }

  async function coverOf(album: AlbumResponse): Promise<ListImageCover | null> {
    if (!album.artworkUrl) return null;
    try {
      const { buffer, contentType } = await fetchCover(album.artworkUrl);
      return { bytes: buffer, contentType };
    } catch (error) {
      // A placeholder is drawn instead, and the picture is still worth having.
      logger.warn({ error: describeError(error) }, 'list image cover failed');
      return null;
    }
  }

  async function draw(title: string, listAlbums: readonly AlbumResponse[]): Promise<Buffer> {
    const started = Date.now();
    const covers = await Promise.all(listAlbums.map(coverOf));
    const picture = await renderImage({ title, covers });
    logger.info(
      { covers: covers.filter((cover) => cover !== null).length, drawMs: Date.now() - started },
      'list image drawn',
    );
    return picture;
  }

  function pictureFor(
    hash: string,
    title: string,
    listAlbums: readonly AlbumResponse[],
  ): Promise<Buffer> {
    const known = kept.get(hash);
    if (known) {
      keep(hash, known);
      return Promise.resolve(known);
    }
    const inProgress = drawing.get(hash);
    if (inProgress) return inProgress;

    const started = draw(title, listAlbums)
      .then((picture) => {
        keep(hash, picture);
        return picture;
      })
      .finally(() => drawing.delete(hash));
    drawing.set(hash, started);
    return started;
  }

  return async (req, res) => {
    const id = listIdSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'List not found' });
      return;
    }

    try {
      const list = await getList({ lists, albums }, null, id.data);
      if (!list) {
        res.status(404).json({ error: 'List not found' });
        return;
      }

      const hash = listImageHash(list.albums);
      if (req.query.v !== hash) {
        res.set('Cache-Control', 'no-store').redirect(302, `${req.baseUrl}${req.path}?v=${hash}`);
        return;
      }

      const picture = await pictureFor(hash, list.title, list.albums);
      res
        .set({
          'Content-Type': LIST_IMAGE_CONTENT_TYPE,
          'Cache-Control': KEEP_FOR_A_YEAR,
          // Link previews are built from this address by other sites.
          'Cross-Origin-Resource-Policy': 'cross-origin',
        })
        .send(picture);
    } catch (error) {
      logger.error({ error: describeError(error) }, 'list image failed');
      res.set('Cache-Control', 'no-store').redirect(302, DEFAULT_CARD);
    }
  };
}
