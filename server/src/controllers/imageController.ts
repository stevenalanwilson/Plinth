import { Request, Response } from 'express';
import { fetchImageBytes } from '../services/imageProxyService';
import { logger } from '../logger';

export async function handleImage(req: Request, res: Response): Promise<void> {
  const { url } = req.query;

  if (typeof url !== 'string' || url.length === 0) {
    res.status(400).json({ error: 'url query param is required' });
    return;
  }

  try {
    const { buffer, contentType } = await fetchImageBytes(url);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    // Helmet defaults to same-origin, but the client can be served from a different origin
    // (Vite on :5173 in dev, a separate Railway service in prod) and must be able to embed
    // these images. Only public cover art from trusted hosts is ever served here.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch image';
    logger.error({ error: message, url }, 'image proxy failed');
    res.status(502).json({ error: message });
  }
}
