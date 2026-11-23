import { Request, Response } from 'express';
import { AlbumRepository } from '../repositories/albumRepository';
import { ListRepository } from '../repositories/listRepository';
import { listIdSchema } from '../schemas/listSchemas';
import { defaultPageHead, injectHead, listPageHead, PageHead } from '../services/albumPageService';
import { getList } from '../services/listService';
import { logger } from '../logger';
import { isLinkPreviewCrawler } from '../utils/linkPreviewCrawler';
import { publicUrl } from '../utils/publicUrl';

interface ListPageDependencies {
  readonly lists: ListRepository;
  readonly albums: AlbumRepository;
  /** The built client's index.html. */
  readonly template: string;
}

/**
 * Logs each list page served, so the logs show how many people arrive on a shared list
 * (crawler: false) and whether shared links are being fetched for previews (crawler: true).
 * A list's code is what lets someone in, so it is not written to the log.
 */
function logView(req: Request, found: boolean): void {
  logger.info({ found, crawler: isLinkPreviewCrawler(req.get('user-agent')) }, 'list page served');
}

/**
 * Serves the web app for /list/:id with that list's title and albums in the head, because link
 * previews are built by crawlers that never run the app's JavaScript. Only a finished list gets
 * a page: one still being made isn't shared yet, so it is answered like one that doesn't exist.
 * Lists are open to anyone with the link but aren't listed, so search engines are asked to skip
 * every answer from here.
 */
export function createListPageHandler({
  lists,
  albums,
  template,
}: ListPageDependencies): (req: Request, res: Response) => Promise<void> {
  function send(res: Response, status: number, head: PageHead): void {
    res.status(status).set('X-Robots-Tag', 'noindex').type('html').send(injectHead(template, head));
  }

  return async (req, res) => {
    const baseUrl = publicUrl(req);
    const notFound: PageHead = { ...defaultPageHead(baseUrl), noindex: true };
    const id = listIdSchema.safeParse(req.params.id);
    if (!id.success) {
      send(res, 404, notFound);
      return;
    }

    try {
      const list = await getList({ lists, albums }, null, id.data);
      logView(req, list !== null);
      if (!list) {
        send(res, 404, notFound);
        return;
      }
      send(res, 200, listPageHead(list, baseUrl));
    } catch (error) {
      // The app can still load and show its own error, so don't turn this into a 500 page.
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, 'list page failed');
      send(res, 200, notFound);
    }
  };
}
