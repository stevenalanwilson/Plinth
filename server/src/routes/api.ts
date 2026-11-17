import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createRecommendHandler } from '../controllers/recommendController';
import { createAlbumHandler } from '../controllers/albumController';
import { createAlbumDetailsHandler } from '../controllers/albumDetailsController';
import { createExampleAlbumHandler } from '../controllers/exampleAlbumController';
import { handleArtwork } from '../controllers/artworkController';
import { handleArtistRelations } from '../controllers/artistRelationsController';
import { handleImage } from '../controllers/imageController';
import { handleArtistEssentials } from '../controllers/artistEssentialsController';
import { AlbumRepository } from '../repositories/albumRepository';

export interface ApiDependencies {
  readonly albums: AlbumRepository;
}

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

// Album pages and the first-run example load from here on every visit, but after the first
// view of an album they read only from the database.
const albumLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a minute.' },
});

// Cold, one request makes several MusicBrainz calls, and they all queue at one per second, so
// this is limited more tightly than the album itself. Repeat views are served from the cache.
const albumDetailsLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a minute.' },
});

export function createApiRouter({ albums }: ApiDependencies): Router {
  const router = Router();
  router.post('/recommend', recommendLimiter, createRecommendHandler(albums));
  router.get('/albums/:slug', albumLimiter, createAlbumHandler(albums));
  router.get('/albums/:slug/details', albumDetailsLimiter, createAlbumDetailsHandler(albums));
  router.get('/example-album', albumLimiter, createExampleAlbumHandler(albums));
  router.post('/artist-essentials', artistEssentialsLimiter, handleArtistEssentials);
  router.get('/artwork', artworkLimiter, handleArtwork);
  router.get('/artist-rels', artistRelsLimiter, handleArtistRelations);
  router.get('/image', imageLimiter, handleImage);
  return router;
}
