import { z } from 'zod';
import { profileName } from './profile.ts';

// Signing in. A person signs up and signs in with an email address and a password.
// The addresses below belong to the sign-in library (they are under /api/auth) and are not operations: they are not
// defined with operation(), a success sets the cookie that proves who is calling, and a failure has the library's
// body, { code, message }, with a code the library decides (INVALID_EMAIL_OR_PASSWORD and the like).
// What each address accepts is written here once: the server refuses a body that does not fit, and every caller
// builds its request from the same rule.

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
 * Signing up: POST. A new account is made and the caller is signed in to it. name is the name they go by, which
 * becomes the name in their profile.
 * An address that already has an account is refused with status 422 and the library's code
 * USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL.
 */
export const SIGN_UP_PATH = '/api/auth/sign-up/email';
export const signUpBody = z.strictObject({ name: profileName, email: signInEmail, password: signInPassword });

/**
 * Signing in: POST. An address with no account and a wrong password get the same answer: status 401 and the
 * library's code INVALID_EMAIL_OR_PASSWORD, so nobody can ask whether an address has an account.
 * The password is only held to the longest length here: one shorter than the shortest goes to the library, which
 * gives it that same answer and no other.
 */
export const SIGN_IN_PATH = '/api/auth/sign-in/email';
export const signInBody = z.strictObject({ email: signInEmail, password: z.string().min(1).max(PASSWORD_MAX_LENGTH) });

/** Signing out: POST, with an empty body. The session ends and the cookie is cleared */
export const SIGN_OUT_PATH = '/api/auth/sign-out';
export const signOutBody = z.strictObject({});
