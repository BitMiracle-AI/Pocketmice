import { createTransport } from 'nodemailer';

/** One mail: plain text, to one address */
export interface Email {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends one mail. It throws when the mail did not go out and never keeps that to itself: whoever asked has someone
 * waiting, who must be told.
 */
export type SendEmail = (email: Email) => Promise<void>;

/**
 * Does not send: prints the mail in the output of the api, where whoever runs it reads it. For development, and
 * for trying a server out before it has a mail service: a sign-in code is then read from the terminal.
 */
export const printEmail: SendEmail = async ({ to, subject, text }) => {
  console.log(`[mail not sent] To: ${to}\nSubject: ${subject}\n\n${text}`);
};

/**
 * A mail is given this long to go out, in milliseconds, from connecting to the server having taken it. Someone is
 * waiting on a sign-in page: when it takes longer they are told it failed, and ask again.
 */
export const SEND_TIMEOUT_MS = 15_000;

export interface SmtpOptions {
  /**
   * The SMTP server and the account to send as, as one address: smtp://user:password@smtp.example.com:587. With
   * smtp the connection is encrypted as soon as the server offers to (STARTTLS); with smtps it is encrypted from
   * the start, which is what port 465 expects.
   */
  url: string;
  /** Who the mail is from, like Pocketmice <noreply@example.com>. The server must let the account send as it */
  from: string;
  /** How long a mail is given to go out. Left out, SEND_TIMEOUT_MS; a test passes a shorter time */
  timeoutMs?: number;
}

/**
 * Sends mail through an SMTP server: the one way every mail service has, so a server that someone runs themselves
 * is not tied to one of them.
 * This file is the only place that knows how mail goes out, and it knows nothing about what a mail is for.
 * Each mail takes a connection of its own, closed when the mail has gone: mail is rare here, and a connection that
 * was kept would mostly be found dead.
 * The server is not asked whether it is there when this is called: a mail server that is down for a while should
 * not keep the api from starting. The first mail finds out.
 */
export function createSmtpMailer({ url, from, timeoutMs = SEND_TIMEOUT_MS }: SmtpOptions): SendEmail {
  const transport = createTransport({ url });

  return async ({ to, subject, text }) => {
    // A server that refuses the one recipient makes this throw. The time limit covers every step of the way
    await transport.sendMail({ from, to, subject, text, signal: AbortSignal.timeout(timeoutMs) });
  };
}
