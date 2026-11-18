import { Request, Response } from 'express';
import { AccountResponse } from '@shared/types';
import { AccountRepository } from '../repositories/accountRepository';
import { DeviceRepository } from '../repositories/deviceRepository';
import { SignInLinkRepository } from '../repositories/signInLinkRepository';
import { deviceOf } from '../middleware/deviceAuth';
import {
  deleteAccount,
  normaliseEmail,
  requestSignIn,
  SignInEmailError,
  signOut,
  TooManySignInRequestsError,
  verifySignIn,
} from '../services/signInService';
import { SignInChannel } from '../utils/signInChannel';
import { logger } from '../logger';

type Handler = (req: Request, res: Response) => Promise<void>;

// Nothing here belongs in a cache: it is about one person, and one of the answers is private.
function noStore(res: Response): void {
  res.set('Cache-Control', 'no-store');
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createSignInHandler(
  links: SignInLinkRepository,
  channel: SignInChannel | null,
): Handler {
  return async (req, res) => {
    noStore(res);
    if (!channel) {
      res.status(503).json({ error: "Sign-in isn't available right now." });
      return;
    }

    const email = normaliseEmail((req.body as Record<string, unknown> | undefined)?.email);
    if (!email) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }

    try {
      await requestSignIn({ links, sender: channel.sender, baseUrl: channel.baseUrl }, email);
      // Never the address: the log says a link went out, not to whom.
      logger.info('sign-in link requested');
      // The same answer whether or not the address has an account, so this can't be used to find
      // out who does.
      res.status(202).json({});
    } catch (error) {
      if (error instanceof TooManySignInRequestsError) {
        res.status(429).json({
          error: 'Too many sign-in links have been asked for that address. Please try again later.',
        });
        return;
      }
      logger.error({ error: describeError(error) }, 'sign-in link failed');
      if (error instanceof SignInEmailError) {
        res.status(502).json({ error: "We couldn't send the email. Please try again." });
        return;
      }
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  };
}

export function createVerifySignInHandler(deps: {
  readonly links: SignInLinkRepository;
  readonly accounts: AccountRepository;
  readonly devices: DeviceRepository;
}): Handler {
  return async (req, res) => {
    noStore(res);
    const token = (req.body as Record<string, unknown> | undefined)?.token;
    if (typeof token !== 'string') {
      res.status(400).json({ error: 'token must be a string' });
      return;
    }

    // Signing in links a device to the account, so there has to be a device to link.
    const device = deviceOf(res);
    if (!device) {
      res.status(400).json({
        error: "This browser can't be signed in. Check that it allows this site to store data.",
      });
      return;
    }

    try {
      const signedIn = await verifySignIn(deps, token, device.id);
      if (!signedIn) {
        res.status(400).json({
          error: 'That link has expired or has already been used. Ask for a new one.',
        });
        return;
      }
      logger.info({ newAccount: signedIn.created }, 'signed in');
      const body: AccountResponse = { account: { email: signedIn.email } };
      res.json(body);
    } catch (error) {
      logger.error({ error: describeError(error) }, 'sign-in failed');
      res.status(500).json({ error: 'Something went wrong signing in. Please try again.' });
    }
  };
}

export function createAccountHandler(accounts: AccountRepository): Handler {
  return async (_req, res) => {
    noStore(res);
    const accountId = deviceOf(res)?.accountId;
    try {
      const account = accountId ? await accounts.findById(accountId) : null;
      const body: AccountResponse = { account: account ? { email: account.email } : null };
      res.json(body);
    } catch (error) {
      logger.error({ error: describeError(error) }, 'account lookup failed');
      res.status(500).json({ error: "Couldn't check whether you're signed in." });
    }
  };
}

export function createSignOutHandler(devices: DeviceRepository): Handler {
  return async (_req, res) => {
    noStore(res);
    const device = deviceOf(res);
    try {
      if (device?.accountId) {
        await signOut(devices, device.id);
        logger.info('signed out');
      }
      // Signing out of nothing is fine: the result is the same.
      res.status(204).end();
    } catch (error) {
      logger.error({ error: describeError(error) }, 'sign-out failed');
      res.status(500).json({ error: 'Something went wrong signing out. Please try again.' });
    }
  };
}

export function createDeleteAccountHandler(deps: {
  readonly accounts: AccountRepository;
  readonly devices: DeviceRepository;
  readonly links: SignInLinkRepository;
}): Handler {
  return async (_req, res) => {
    noStore(res);
    const accountId = deviceOf(res)?.accountId;
    // Not a 401, which the client reads as "your device token is stale".
    if (!accountId) {
      res.status(403).json({ error: "You're not signed in." });
      return;
    }

    try {
      await deleteAccount(deps, accountId);
      logger.info('account deleted');
      res.status(204).end();
    } catch (error) {
      logger.error({ error: describeError(error) }, 'account deletion failed');
      res.status(500).json({ error: "Couldn't delete the account. Please try again." });
    }
  };
}
