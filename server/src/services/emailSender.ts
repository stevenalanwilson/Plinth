import { logger } from '../logger';

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface EmailSender {
  /** Sends one email, rejecting if it could not be handed on for delivery. */
  send(message: EmailMessage): Promise<void>;
}

const RESEND_URL = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10_000;

interface ResendOptions {
  readonly apiKey: string;
  /** The sender, as an address or as `Name <address>`. */
  readonly from: string;
  readonly fetchImpl?: typeof fetch;
}

/** Sends through Resend's HTTP API. */
export function createResendEmailSender({
  apiKey,
  from,
  fetchImpl = fetch,
}: ResendOptions): EmailSender {
  return {
    async send({ to, subject, text }: EmailMessage): Promise<void> {
      const response = await fetchImpl(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      // The status alone: the body can repeat the address, which doesn't belong in a log.
      if (!response.ok) throw new Error(`Resend refused the email (status ${response.status})`);
    },
  };
}

/**
 * For local development without an email account: writes the whole email to the log, so the
 * sign-in link can be copied from there. Never use it in production, where it would put working
 * sign-in links in the logs.
 */
export function createLoggingEmailSender(): EmailSender {
  return {
    async send({ to, subject, text }: EmailMessage): Promise<void> {
      logger.info({ to, subject, text }, 'email not sent (no email service configured)');
    },
  };
}
