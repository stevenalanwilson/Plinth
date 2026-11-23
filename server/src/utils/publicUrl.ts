import { Request } from 'express';

/**
 * The address link previews must use, which has to be absolute. PUBLIC_URL is the real answer;
 * without it, use the address this request arrived on. Only "https" is taken from a proxy's
 * header, so nothing else a caller sends ends up in the page.
 */
export function publicUrl(req: Request): string {
  const configured = process.env.PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const forwarded = req.get('x-forwarded-proto')?.split(',')[0].trim();
  const protocol = forwarded === 'https' ? 'https' : req.protocol;
  return `${protocol}://${req.get('host') ?? 'localhost'}`;
}
