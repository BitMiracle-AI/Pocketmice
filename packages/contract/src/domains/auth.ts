import { z } from 'zod';
import { operation } from '../operation.ts';
import { profileName } from './profile.ts';

// Signing in. A person is known by their email address, and a server signs people in one of two ways (see
// signInMethod): with a password, or with a code sent to the address.
// The addresses below belong to the sign-in library (they are under /api/auth) and are not operations: they are not
// defined with operation(), a success sets the cookie that proves who is calling, and a failure has the library's
// body, { code, message }, with a code the library decides (INVALID_EMAIL_OR_PASSWORD and the like).
// A body that does not fit the rule written here never reaches the library: the server refuses it in the same
// shape, with the code INVALID_BODY. One failure has no code: a request that comes too often is status 429, with a
// message alone.
// An address of the way this server does not use is answered like one that does not exist: status 404, NOT_FOUND.
// What each address accepts is written here once: the server refuses a body that does not fit, and every caller
// builds its request from the same rule.

/**
 * How people sign in to a server. A server has one of the two, never both, and getServerInfo says which:
 * - password: an email address and a password. For a server that sends no mail: nothing proves that an address
 *   belongs to whoever signed up with it, and a password that is forgotten cannot be set again.
 * - emailCode: a code sent to the email address, asked for with requestSignInCode. For a server that was given a
 *   way to send mail. There are no passwords.
 * Which one is not a setting of its own: a server that can send mail uses codes, and one that cannot uses
 * passwords.
 * A server that goes from password to emailCode keeps its accounts, each under its address. The first time someone
 * signs in to such an account with a code, its password, its sessions and its API keys are taken away: none of them
 * is known to belong to the person the address belongs to. The other way round is not supported: an account made
 * with a code has no password.
 */
export const SIGN_IN_METHODS = ['password', 'emailCode'] as const;

export type SignInMethod = (typeof SIGN_IN_METHODS)[number];

export const signInMethod = z.enum(SIGN_IN_METHODS);

/** An email address has at most this many characters: the longest the mail standard allows an address to be */
export const EMAIL_MAX_LENGTH = 254;

/**
 * The email address someone signs in with. Spaces around it are dropped and it is lowercased before it is checked:
 * what is stored is lowercase.
 */
export const signInEmail = z.string().trim().toLowerCase().pipe(z.email().max(EMAIL_MAX_LENGTH));

/** A password has at least and at most this many characters */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** A password: between the two lengths, with no other rule. It is used as it is; spaces around it are kept */
export const signInPassword = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

/**
 * Signing up with a password: POST. A new account is made and the caller is signed in to it. name is the name they
 * go by, which becomes the name in their profile.
 * An address that already has an account is refused with status 422 and the library's code
 * USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL.
 */
export const SIGN_UP_PATH = '/api/auth/sign-up/email';
export const signUpBody = z.strictObject({ name: profileName, email: signInEmail, password: signInPassword });

/**
 * Signing in with a password: POST. An address with no account and a wrong password get the same answer: status 401
 * and the library's code INVALID_EMAIL_OR_PASSWORD. Signing in does not tell whether an address has an account;
 * signing up does, and has to, as long as an address is not verified by mail.
 * The password is only held to the longest length here: one shorter than the shortest goes to the library, which
 * gives it that same answer and no other.
 */
export const SIGN_IN_PATH = '/api/auth/sign-in/email';
export const signInBody = z.strictObject({ email: signInEmail, password: z.string().min(1).max(PASSWORD_MAX_LENGTH) });

/** A sign-in code is this many digits */
export const SIGN_IN_CODE_LENGTH = 6;

/** A sign-in code works for this many seconds after it was asked for */
export const SIGN_IN_CODE_TTL_SECONDS = 300;

/** A sign-in code that was entered wrong this many times stops working, also for the right one: ask for a new code */
export const SIGN_IN_CODE_WRONG_TRIES = 3;

/** A sign-in code: exactly SIGN_IN_CODE_LENGTH digits */
export const signInCode = z.string().regex(new RegExp(`^\\d{${SIGN_IN_CODE_LENGTH}}$`));

/**
 * Sends a sign-in code to an email address, to sign in with at CODE_SIGN_IN_PATH. Anyone may ask, for any address:
 * the answer is the same whether or not the address has an account.
 * A new code takes the place of the one sent to the same address before it: only the last one works.
 * UNKNOWN_OPERATION: this server signs people in with a password, and sends no codes.
 * TOO_MANY_REQUESTS: codes were asked for too often, from where this request comes from or for this address. No
 * mail was sent.
 * CODE_NOT_SENT: the mail did not go out. Asking again may work.
 */
export const requestSignInCode = operation({
  name: 'requestSignInCode',
  kind: 'write',
  access: 'public',
  belongsTo: 'none',
  input: z.object({ email: signInEmail }),
  output: z.object({}),
  errors: ['TOO_MANY_REQUESTS', 'CODE_NOT_SENT']
});

/**
 * Signing in with a code: POST, with an address and the code that requestSignInCode sent to it. An address with no
 * account gets one here, and the caller is signed in to it: with codes, signing up and signing in are one step.
 * Nobody is asked for a name: a new account goes by the part of its address before the @, until the person changes
 * it (updateProfile).
 * A code works once. What the library answers when it does not let the caller in:
 * - status 400, INVALID_OTP: the code is wrong, or the address has no code: none was asked for, or it was used. A
 *   wrong code may be tried again.
 * - status 400, OTP_EXPIRED: the code is older than SIGN_IN_CODE_TTL_SECONDS.
 * - status 403, TOO_MANY_ATTEMPTS: the code was entered wrong SIGN_IN_CODE_WRONG_TRIES times before.
 * After the last two, a new code has to be asked for.
 */
export const CODE_SIGN_IN_PATH = '/api/auth/sign-in/email-otp';
export const codeSignInBody = z.strictObject({ email: signInEmail, otp: signInCode });

/** Signing out: POST, with an empty body. The session ends and the cookie is cleared */
export const SIGN_OUT_PATH = '/api/auth/sign-out';
export const signOutBody = z.strictObject({});
