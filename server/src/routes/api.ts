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
import { createRegisterDeviceHandler } from '../controllers/deviceController';
import {
  createAccountHandler,
  createDeleteAccountHandler,
  createSignInHandler,
  createSignOutHandler,
  createVerifySignInHandler,
} from '../controllers/authController';
import { createDeviceAuth } from '../middleware/deviceAuth';
import { AlbumRepository } from '../repositories/albumRepository';
import { DeviceRepository } from '../repositories/deviceRepository';
import { AccountRepository } from '../repositories/accountRepository';
import { SignInLinkRepository } from '../repositories/signInLinkRepository';
import { DailyPickLimiter } from '../services/dailyLimitService';
import { SignInChannel } from '../utils/signInChannel';

export interface ApiDependencies {
  readonly albums: AlbumRepository;
  readonly devices: DeviceRepository;
  readonly dailyLimit: DailyPickLimiter;
  readonly accounts: AccountRepository;
  readonly signInLinks: SignInLinkRepository;
  /** How sign-in links are sent, or null when sign-in isn't set up and the routes say so. */
  readonly signInChannel: SignInChannel | null;
}

const recommendLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a minute.' },
});

// A token costs a row, and tokens are what daily limits will count by, so handing them out is
// limited by address. Generous enough for a household or an office behind one address.
const deviceLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Each request sends an email, so this is tighter than most. There is also a limit per address
// emailed, which is what stops someone being flooded from many places.
const signInLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Links can't be guessed, so this only stops hammering.
const verifyLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Checking who is signed in happens on every page load, so this is looser.
const accountLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
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

export function createApiRouter({
  albums,
  devices,
  dailyLimit,
  accounts,
  signInLinks,
  signInChannel,
}: ApiDependencies): Router {
  const router = Router();
  // Before the check below, so a client holding a stale token can still ask for a new one.
  router.post('/devices', deviceLimiter, createRegisterDeviceHandler(devices));
  router.use(createDeviceAuth(devices));
  router.post('/auth/sign-in', signInLimiter, createSignInHandler(signInLinks, signInChannel));
  router.post(
    '/auth/verify',
    verifyLimiter,
    createVerifySignInHandler({ links: signInLinks, accounts, devices }),
  );
  router.get('/auth/me', accountLimiter, createAccountHandler(accounts));
  router.post('/auth/sign-out', accountLimiter, createSignOutHandler(devices));
  router.delete(
    '/auth/account',
    accountLimiter,
    createDeleteAccountHandler({ accounts, devices, links: signInLinks }),
  );
  router.post('/recommend', recommendLimiter, createRecommendHandler(albums, dailyLimit));
  router.get('/albums/:slug', albumLimiter, createAlbumHandler(albums));
  router.get('/albums/:slug/details', albumDetailsLimiter, createAlbumDetailsHandler(albums));
  router.get('/example-album', albumLimiter, createExampleAlbumHandler(albums));
  router.post('/artist-essentials', artistEssentialsLimiter, handleArtistEssentials);
  router.get('/artwork', artworkLimiter, handleArtwork);
  router.get('/artist-rels', artistRelsLimiter, handleArtistRelations);
  router.get('/image', imageLimiter, handleImage);
  return router;
}
