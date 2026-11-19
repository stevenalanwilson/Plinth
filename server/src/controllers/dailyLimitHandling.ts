import { Request, Response } from 'express';
import { DAILY_LIMIT_CODE } from '@shared/types';
import { logger } from '../logger';
import { deviceOf } from '../middleware/deviceAuth';
import { DailyLimitError, secondsUntilNextDay, Visitor } from '../services/dailyLimitService';

/**
 * Who a pick is counted against: the account the device is signed in to, else the device, else
 * for a request without a token, its address.
 */
export function visitorOf(req: Request, res: Response): Visitor {
  const device = deviceOf(res);
  if (!device) return { kind: 'address', address: req.ip ?? '' };
  if (device.accountId) return { kind: 'account', id: device.accountId };
  return { kind: 'device', id: device.id };
}

const COMES_BACK = 'They come back at midnight UTC, and your crate is still here.';

function limitMessage(error: DailyLimitError): string {
  if (error.scope === 'global') {
    return `Plinth has given out all its picks for today. ${COMES_BACK}`;
  }
  // Zero is how picks are paused, and "all 1" reads oddly, so each gets its own wording.
  if (error.limit === 0) return 'Picks are paused for now. Your crate is still here.';
  if (error.limit === 1)
    return `That was today's pick. More come back at midnight UTC, and your crate is still here.`;
  return `That's all ${error.limit} picks for today. ${COMES_BACK}`;
}

/** Answers a request that was turned away because a daily limit was used up. */
export function respondLimitReached(res: Response, error: DailyLimitError): void {
  // Counts only: how often each limit is hit shows whether the numbers are about right.
  logger.info({ scope: error.scope }, 'daily limit reached');
  res.set('Retry-After', String(secondsUntilNextDay(new Date())));
  res.status(429).json({ error: limitMessage(error), code: DAILY_LIMIT_CODE });
}
