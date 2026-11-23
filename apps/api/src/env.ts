/** Reads an environment variable that must be set. A missing one is an error: there is no default */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See apps/api/.env.example.`);
  return value;
}

/**
 * Reads a list of web origins, separated by commas. Each must be written the way a browser reports an origin:
 * scheme, host and port, with no path and no trailing slash.
 * A wrong spelling is an error here. Otherwise it would never match what a browser reports, and the symptom would
 * be every request from the web page failing while the server logs nothing.
 */
export function requireOrigins(name: string): string[] {
  return requireEnv(name)
    .split(',')
    .map((item) => {
      const origin = item.trim();
      if (!URL.canParse(origin) || new URL(origin).origin !== origin) {
        throw new Error(
          `Environment variable ${name} has an invalid origin "${origin}". Write it like http://localhost:11211, with no path and no trailing slash.`
        );
      }
      return origin;
    });
}

/**
 * Reads an optional port number: fallback when it is not set. Set to anything but a whole number from 1 to 65535
 * is an error.
 */
export function portFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Environment variable ${name} must be a port number between 1 and 65535, got "${value}".`);
  }
  return port;
}

/**
 * Reads the optional address to listen on: fallback when it is not set. It is not checked here: listening on an
 * address this machine does not have fails when the server starts, and the process exits with that error.
 */
export function hostFromEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

/** Where the bytes of files are kept: a folder on this machine, or a bucket of an S3-compatible service */
/** The bucket the bytes of files are kept in, and how it is reached */
export interface StorageConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** The address of the service. Left out for AWS, which is found from the region */
  endpoint?: string;
  /** Whether the bucket is named in the path of the address and not in its host */
  forcePathStyle: boolean;
}

/**
 * Reads where the bytes of files are kept: a bucket of an S3-compatible service, named by S3_BUCKET with the rest
 * of its group. There is no default: the server never guesses where people's files go.
 */
export function storageFromEnv(): StorageConfig {
  const pathStyle = process.env.S3_FORCE_PATH_STYLE;
  if (pathStyle && pathStyle !== 'true' && pathStyle !== 'false') {
    throw new Error(`Environment variable S3_FORCE_PATH_STYLE must be true or false, got "${pathStyle}".`);
  }
  const endpoint = process.env.S3_ENDPOINT;
  // Written without its scheme, localhost:9000 still reads as an address: one whose scheme is "localhost"
  if (endpoint && !(URL.canParse(endpoint) && /^https?:$/.test(new URL(endpoint).protocol))) {
    throw new Error(
      `Environment variable S3_ENDPOINT is not an address: "${endpoint}". Write it with its scheme, like http://localhost:9000.`
    );
  }
  return {
    bucket: requireEnv('S3_BUCKET'),
    region: requireEnv('S3_REGION'),
    accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
    ...(endpoint && { endpoint }),
    forcePathStyle: pathStyle === 'true'
  };
}

/**
 * How mail is sent: through an SMTP server, as whom; or not sent at all and printed in the output of the api, for
 * development
 */
export type MailConfig = { kind: 'smtp'; smtpUrl: string; from: string } | { kind: 'console' };

/**
 * Reads how mail is sent, when it is. SMTP_URL and MAIL_FROM go together: with both the server sends mail, with
 * neither it sends none, and one without the other is an error. MAIL_TO_CONSOLE=true is the third way, for
 * development: mail is printed and not sent, and it does not go with the other two.
 * Whether a server has a way with mail settles how people sign in to it (see createAuth in domains/auth/auth.ts).
 * An address that is wrong is not repeated in the error: it has the password of the mail account in it.
 */
export function mailFromEnv(): MailConfig | null {
  const smtpUrl = process.env.SMTP_URL;
  const from = process.env.MAIL_FROM;
  const toConsole = process.env.MAIL_TO_CONSOLE;
  if (toConsole && toConsole !== 'true' && toConsole !== 'false') {
    throw new Error(`Environment variable MAIL_TO_CONSOLE must be true or false, got "${toConsole}".`);
  }
  if (toConsole === 'true') {
    if (smtpUrl || from) {
      throw new Error(
        'MAIL_TO_CONSOLE is true and SMTP_URL or MAIL_FROM is set too. Set one: mail is printed, or it is sent.'
      );
    }
    return { kind: 'console' };
  }
  if (!smtpUrl && !from) return null;
  if (!smtpUrl || !from) {
    throw new Error(
      `${smtpUrl ? 'SMTP_URL is set and MAIL_FROM is not' : 'MAIL_FROM is set and SMTP_URL is not'}. Set both to send mail, or neither: see apps/api/.env.example.`
    );
  }
  // Written without its scheme, smtp.example.com:587 still reads as an address: one whose scheme is the host
  if (!(URL.canParse(smtpUrl) && /^smtps?:$/.test(new URL(smtpUrl).protocol) && new URL(smtpUrl).hostname)) {
    throw new Error(
      'Environment variable SMTP_URL is not the address of an SMTP server. Write it like smtp://user:password@smtp.example.com:587.'
    );
  }
  if (!/[^\s@<]+@[^\s@>]+/.test(from)) {
    throw new Error(
      `Environment variable MAIL_FROM has no email address in it: "${from}". Write it like Pocketmice <noreply@example.com>.`
    );
  }
  return { kind: 'smtp', smtpUrl, from };
}
