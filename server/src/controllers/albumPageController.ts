import { Request, Response } from 'express';
import { AlbumRepository } from '../repositories/albumRepository';
import { slugSchema } from '../schemas/albumSchemas';
import { getAlbum } from '../services/albumService';
import { albumPageHead, defaultPageHead, injectHead, PageHead } from '../services/albumPageService';
import { logger } from '../logger';
import { isLinkPreviewCrawler } from '../utils/linkPreviewCrawler';

interface AlbumPageDependencies {
  readonly albums: AlbumRepository;
  /** The built client's index.html. */
  readonly template: string;
}

/**
 * The address link previews must use, which has to be absolute. PUBLIC_URL is the real answer;
 * without it, use the address this request arrived on. Only "https" is taken from a proxy's
 * header, so nothing else a caller sends ends up in the page.
 */
function publicUrl(req: Request): string {
  const configured = process.env.PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const forwarded = req.get('x-forwarded-proto')?.split(',')[0].trim();
  const protocol = forwarded === 'https' ? 'https' : req.protocol;
  return `${protocol}://${req.get('host') ?? 'localhost'}`;
}

/**
 * Logs each album page served, so the logs show how many people arrive on a shared link
 * (crawler: false) and whether shared links are being fetched for previews (crawler: true).
 * Opening an album from inside the app doesn't come here, so these are arrivals from outside.
 */
function logView(req: Request, slug: string, found: boolean): void {
  logger.info(
    { slug, found, crawler: isLinkPreviewCrawler(req.get('user-agent')) },
    'album page served',
  );
}

/**
 * Serves the web app for /album/:slug with that album's title, description and cover in the
 * head, because link previews are built by crawlers that never run the app's JavaScript.
 * People get exactly the page they would have got anyway; the app takes over once it loads.
 */
export function createAlbumPageHandler({
  albums,
  template,
}: AlbumPageDependencies): (req: Request, res: Response) => Promise<void> {
  function send(res: Response, status: number, head: PageHead): void {
    res.status(status).type('html').send(injectHead(template, head));
  }

  return async (req, res) => {
    const baseUrl = publicUrl(req);
    const slug = slugSchema.safeParse(req.params.slug);
    if (!slug.success) {
      send(res, 404, defaultPageHead(baseUrl));
      return;
    }

    try {
      const album = await getAlbum(albums, slug.data);
      logView(req, slug.data, album !== null);
      if (!album) {
        send(res, 404, defaultPageHead(baseUrl));
        return;
      }
      send(res, 200, albumPageHead(album, baseUrl));
    } catch (error) {
      // The app can still load and show its own error, so don't turn this into a 500 page.
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, slug: slug.data }, 'album page failed');
      send(res, 200, defaultPageHead(baseUrl));
    }
  };
}
