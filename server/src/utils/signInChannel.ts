import {
  createLoggingEmailSender,
  createResendEmailSender,
  EmailSender,
} from '../services/emailSender';

interface ChannelEnvironment {
  readonly RESEND_API_KEY?: string;
  readonly EMAIL_FROM?: string;
  readonly PUBLIC_URL?: string;
  readonly CORS_ORIGIN?: string;
  readonly NODE_ENV?: string;
}

/** How sign-in links get to people: the service that sends them, and the address they open. */
export interface SignInChannel {
  readonly sender: EmailSender;
  readonly baseUrl: string;
}

export interface SignInChannelResult {
  /** Null when sign-in can't work, so the sign-in routes say so rather than pretending. */
  readonly channel: SignInChannel | null;
  /** What is missing, for the log, when the channel is null. */
  readonly missing: readonly string[];
}

const DEVELOPMENT_ORIGIN = 'http://localhost:5173';

function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * In production, sign-in needs the email service (RESEND_API_KEY and EMAIL_FROM) and the address
 * the app lives on (PUBLIC_URL, which the link in the email starts with). Without all three it is
 * switched off, not half-working. Anywhere else, a missing email service means links are written
 * to the log, so sign-in can be tried without one. Never in production, where that would put
 * working links in the logs.
 */
export function signInChannel(env: ChannelEnvironment): SignInChannelResult {
  const apiKey = present(env.RESEND_API_KEY);
  const from = present(env.EMAIL_FROM);
  const publicUrl = present(env.PUBLIC_URL);

  if (env.NODE_ENV === 'production') {
    const missing = [
      ['RESEND_API_KEY', apiKey],
      ['EMAIL_FROM', from],
      ['PUBLIC_URL', publicUrl],
    ].flatMap(([name, value]) => (value ? [] : [name as string]));
    if (missing.length > 0 || !apiKey || !from || !publicUrl) return { channel: null, missing };
    return {
      channel: { sender: createResendEmailSender({ apiKey, from }), baseUrl: publicUrl },
      missing: [],
    };
  }

  // The client in development is not served by this server, so its origin is the best guess.
  const baseUrl = publicUrl ?? present(env.CORS_ORIGIN) ?? DEVELOPMENT_ORIGIN;
  const sender =
    apiKey && from ? createResendEmailSender({ apiKey, from }) : createLoggingEmailSender();
  return { channel: { sender, baseUrl }, missing: [] };
}
