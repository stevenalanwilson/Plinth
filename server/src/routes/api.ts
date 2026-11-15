import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { handleRecommend } from '../controllers/recommendController';
import { handleArtwork } from '../controllers/artworkController';
import { handleArtistRelations } from '../controllers/artistRelationsController';
import { handleImage } from '../controllers/imageController';
import { handleArtistEssentials } from '../controllers/artistEssentialsController';

export const apiRouter = Router();

const recommendLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a minute.' },
});

const artworkLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a minute.' },
});

const imageLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a minute.' },
});

const artistRelsLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a minute.' },
});

const artistEssentialsLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a minute.' },
});

apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

apiRouter.post('/recommend', recommendLimiter, handleRecommend);
apiRouter.post('/artist-essentials', artistEssentialsLimiter, handleArtistEssentials);
apiRouter.get('/artwork', artworkLimiter, handleArtwork);
apiRouter.get('/artist-rels', artistRelsLimiter, handleArtistRelations);
apiRouter.get('/image', imageLimiter, handleImage);
