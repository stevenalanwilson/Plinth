import { createHash, randomBytes } from 'crypto';
import { AccountRepository } from '../repositories/accountRepository';
import { DeviceRepository } from '../repositories/deviceRepository';
import { SignInLinkRepository } from '../repositories/signInLinkRepository';
import { EmailSender } from './emailSender';
import { logger } from '../logger';

/** How long a link works for. */
export const SIGN_IN_LINK_TTL_MS = 15 * 60 * 1000;
/** How many links one address can be sent in an hour, so Plinth can't be used to spam someone. */
export const MAX_LINKS_PER_EMAIL_PER_HOUR = 5;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CLEANUP_INTERVAL_MS = DAY_MS;
// The prefix makes a leaked link easy to recognise and to scan for.
const TOKEN_PREFIX = 'pls_';
// 32 random bytes written as base64url are 43 characters.
const TOKEN_FORMAT = /^pls_[A-Za-z0-9_-]{43}$/;
const MAX_EMAIL_LENGTH = 254;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The address as it is stored and compared: trimmed and in lower case, or null if it can't be an
 * email address. Only the shape is checked. Whether it works is for the email itself to say.
 */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_FORMAT.test(email)) return null;
  return email;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

/** Too many links have been asked for this address lately. */
export class TooManySignInRequestsError extends Error {
  constructor() {
    super('Too many sign-in links requested for this address');
    this.name = 'TooManySignInRequestsError';
  }
}

/** The email service refused or couldn't be reached. */
export class SignInEmailError extends Error {
  constructor(cause: unknown) {
    super(`Couldn't send the sign-in email: ${cause instanceof Error ? cause.message : cause}`);
    this.name = 'SignInEmailError';
  }
}

export interface SignInEmailDependencies {
  readonly links: SignInLinkRepository;
  readonly sender: EmailSender;
  /** The address people reach the app on, which the link in the email starts with. */
  readonly baseUrl: string;
}

/**
 * Emails a one-use link that signs in whoever opens it. The token is in the part of the address
 * after the #, which browsers never send to a server, so it stays out of access logs.
 */
export async function requestSignIn(
  { links, sender, baseUrl }: SignInEmailDependencies,
  email: string,
  now: Date = new Date(),
): Promise<void> {
  const recent = await links.countCreatedSince(email, new Date(now.getTime() - HOUR_MS));
  if (recent >= MAX_LINKS_PER_EMAIL_PER_HOUR) throw new TooManySignInRequestsError();

  const token = generateToken();
  const tokenHash = hashToken(token);
  await links.create({
    tokenHash,
    email,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SIGN_IN_LINK_TTL_MS),
  });

  const link = `${baseUrl.replace(/\/+$/, '')}/signin#token=${token}`;
  try {
    await sender.send({
      to: email,
      subject: 'Your Plinth sign-in link',
      text: [
        'Open this link to sign in to Plinth:',
        '',
        link,
        '',
        `It works once and expires in ${SIGN_IN_LINK_TTL_MS / 60_000} minutes.`,
        '',
        "If you didn't ask for it, you can ignore this email. Nobody can sign in without the link.",
      ].join('\n'),
    });
  } catch (error) {
    // The link was never delivered, so it shouldn't count towards the limit or sit waiting.
    await links.deleteByTokenHash(tokenHash).catch(() => undefined);
    throw new SignInEmailError(error);
  }
}

export interface VerifyDependencies {
  readonly links: SignInLinkRepository;
  readonly accounts: AccountRepository;
  readonly devices: DeviceRepository;
}

export interface SignedIn {
  readonly email: string;
  /** True when this sign-in made the account: the first time this email has been used. */
  readonly created: boolean;
}

/**
 * Uses a link up and signs the device that opened it in to the account for its email, making the
 * account the first time. Returns null for a link that is wrong, used, or expired.
 */
export async function verifySignIn(
  { links, accounts, devices }: VerifyDependencies,
  token: string,
  deviceId: string,
  now: Date = new Date(),
): Promise<SignedIn | null> {
  // Junk is turned away without a database lookup.
  if (!TOKEN_FORMAT.test(token)) return null;

  const email = await links.consume(hashToken(token), now);
  if (email === null) return null;

  const { account, created } = await accounts.findOrCreateByEmail(email, now);
  await devices.linkToAccount(deviceId, account.id);
  return { email: account.email, created };
}

/** Signs a device out. The account, and its other devices, are left as they are. */
export function signOut(devices: DeviceRepository, deviceId: string): Promise<void> {
  return devices.unlinkFromAccount(deviceId);
}

export interface DeleteAccountDependencies {
  readonly accounts: AccountRepository;
  readonly devices: DeviceRepository;
  readonly links: SignInLinkRepository;
}

/**
 * Removes an account and everything kept about it: every device is signed out, and the links
 * sent to its email are removed. The account itself goes last, so a failure part way can be
 * tried again. Returns false if there was no such account.
 */
export async function deleteAccount(
  { accounts, devices, links }: DeleteAccountDependencies,
  accountId: string,
): Promise<boolean> {
  const account = await accounts.findById(accountId);
  if (!account) return false;

  await devices.unlinkAllFromAccount(accountId);
  await links.deleteForEmail(account.email);
  return accounts.delete(accountId);
}

/** Removes links that expired more than a day ago, returning how many. */
export function removeOldSignInLinks(
  links: SignInLinkRepository,
  now: Date = new Date(),
): Promise<number> {
  return links.deleteExpiredBefore(new Date(now.getTime() - DAY_MS));
}

export function startSignInLinkCleanup(
  links: SignInLinkRepository,
  intervalMs: number = CLEANUP_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    removeOldSignInLinks(links).catch((error: unknown) => {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'sign-in link cleanup failed',
      );
    });
  }, intervalMs);
  // The timer must not keep the process alive on its own.
  timer.unref();
  return () => clearInterval(timer);
}
