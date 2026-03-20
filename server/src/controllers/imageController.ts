import { Request, Response } from 'express';
import { fetchImageBytes } from '../services/imageProxyService';

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
    res.send(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch image';
    res.status(502).json({ error: message });
  }
}
