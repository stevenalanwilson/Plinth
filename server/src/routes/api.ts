import { Router, Request, Response } from 'express';
import { handleRecommend } from '../controllers/recommendController';
import { handleArtwork } from '../controllers/artworkController';
import { handleImage } from '../controllers/imageController';

export const apiRouter = Router();

apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

apiRouter.post('/recommend', handleRecommend);
apiRouter.get('/artwork', handleArtwork);
apiRouter.get('/image', handleImage);
