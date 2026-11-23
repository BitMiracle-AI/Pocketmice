import {
  CODE_SIGN_IN_PATH,
  type codeSignInBody,
  SIGN_IN_PATH,
  SIGN_OUT_PATH,
  SIGN_UP_PATH,
  type signInBody,
  type signUpBody
} from '@pocketmice/contract/domains/auth';
import type { UniversalErrorCode } from '@pocketmice/contract/errors';
import type { z } from 'zod';
import { type ApiClientConfig, type Failure, failureOfThrown, isServerUrl } from './api.ts';

// Signing in and out, for a caller that is signed in by a cookie: a web page. These are the requests to the
// addresses of the sign-in library (see domains/auth.ts in the contract, where what each address takes and answers
// is written). They are not operations: a success sets or clears the cookie and carries nothing else, and a
// failure has the library's body, { code, message }, not ours.
// A failure is read into the same result a call of an operation gives, so a page tells a person about both the
// same way:
// - a code the address is known to refuse with is passed on as the library names it (INVALID_OTP, say);
// - a request that came too often is TOO_MANY_REQUESTS: the library answers it with status 429 and no code;
// - what the server refuses before the library sees it, and what any request may be refused with, becomes the code
//   an operation would have got: INVALID_INPUT, INPUT_TOO_LARGE, FORBIDDEN, UNKNOWN_OPERATION, INTERNAL;
// - anything else is BAD_RESPONSE.
// This side holds no cookie and reads none: the fetch that is passed in sends it and keeps it.

/** A request to a sign-in address worked, or failed with a code. Any of them may be asked too often */
export type AuthResult<Code extends string = never> = { ok: true } | Failure<Code | 'TOO_MANY_REQUESTS'>;

/** What the server answers with before the library sees the request, and the code an operation gets for the same */
const OURS: Record<string, UniversalErrorCode> = {
  INVALID_BODY: 'INVALID_INPUT',
  UNSUPPORTED_MEDIA_TYPE: 'INVALID_INPUT',
  BODY_TOO_LARGE: 'INPUT_TOO_LARGE',
  // An address of the way this server does not sign people in is answered like one that is not there
  NOT_FOUND: 'UNKNOWN_OPERATION',
  INTERNAL_SERVER_ERROR: 'INTERNAL'
};

/**
 * Builds the four requests for the server at baseUrl. Each answers with a result and never throws.
 * A config that is wrong (the address) fails here, not at the first request.
 */
export function createAuthClient(config: ApiClientConfig) {
  if (!isServerUrl(config.baseUrl)) {
    throw new Error(`API base URL "${config.baseUrl}" is invalid. Write it like https://api.example.com.`);
  }
  // Called on its own, not as the config's: see createApiClient
  const send = config.fetch;

  /** Sends one request. name is what it is called in messages; declared are the codes this address refuses with */
  async function post<Code extends string>(
    name: string,
    path: string,
    input: unknown,
    declared: readonly Code[]
  ): Promise<AuthResult<Code>> {
    const url = new URL(path, config.baseUrl).href;
    // A step of its own, as in createApiClient: what JSON cannot express is a bug on this side, not the network
    let body: string;
    try {
      body = JSON.stringify(input);
    } catch (thrown) {
      config.reportError(thrown, name);
      const message = `Calling ${name} failed before a response arrived.`;
      return { ok: false, code: 'UNEXPECTED', message, cause: thrown };
    }

    let status: number;
    let text: string;
    try {
      const response = await send(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      status = response.status;
      text = await response.text();
    } catch (thrown) {
      const failure = failureOfThrown(thrown, name);
      if (failure.code === 'UNEXPECTED') config.reportError(thrown, name);
      return failure;
    }
    if (status >= 200 && status < 300) return { ok: true };
    return refusalOf(name, status, text, declared);
  }

  return {
    /**
     * Signs up with a password, and signs the caller in to the new account.
     * USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: the address already has an account.
     */
    signUp: (input: z.input<typeof signUpBody>) =>
      post('signUp', SIGN_UP_PATH, input, ['USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL']),

    /**
     * Signs in with a password.
     * INVALID_EMAIL_OR_PASSWORD: the password is wrong, or the address has no account: the answer does not say
     * which.
     */
    signIn: (input: z.input<typeof signInBody>) => post('signIn', SIGN_IN_PATH, input, ['INVALID_EMAIL_OR_PASSWORD']),

    /**
     * Signs in with the code that requestSignInCode sent to the address. An address with no account gets one.
     * INVALID_OTP: the code is wrong, or the address has no code that works; a wrong code may be tried again.
     * OTP_EXPIRED: the code is too old. TOO_MANY_ATTEMPTS: it was entered wrong too often. After these two, a new
     * code has to be asked for.
     */
    signInWithCode: (input: { email: string; code: string }) =>
      post(
        'signInWithCode',
        CODE_SIGN_IN_PATH,
        { email: input.email, otp: input.code } satisfies z.input<typeof codeSignInBody>,
        ['INVALID_OTP', 'OTP_EXPIRED', 'TOO_MANY_ATTEMPTS']
      ),

    /** Signs out: the session ends and the cookie is cleared */
    signOut: () => post('signOut', SIGN_OUT_PATH, {}, [])
  };
}

export type AuthClient = ReturnType<typeof createAuthClient>;

/** What an answer that is not a success says went wrong */
function refusalOf<Code extends string>(
  name: string,
  status: number,
  text: string,
  declared: readonly Code[]
): Failure<Code | 'TOO_MANY_REQUESTS'> {
  const { code, message } = refusalBody(text);
  const said = message ?? `The server answered ${name} with status ${status}.`;

  // The library says "too often" with the status alone
  if (status === 429) return { ok: false, code: 'TOO_MANY_REQUESTS', message: said };
  if (code !== undefined) {
    const known = declared.find((each) => each === code);
    if (known !== undefined) return { ok: false, code: known, message: said };
    const ours = OURS[code];
    if (ours !== undefined) return { ok: false, code: ours, message: said };
  }
  // Whatever else is refused with 403 is the library not letting the caller in at all: a web page it does not
  // allow, in the main
  if (status === 403) return { ok: false, code: 'FORBIDDEN', message: said };

  return {
    ok: false,
    code: 'BAD_RESPONSE',
    message:
      code === undefined
        ? `The server answered ${name} with status ${status} and no error code.`
        : `The server answered ${name} with an error code this client does not know: ${code}. ${said}`
  };
}

/** The code and the message of a refusal, each when the body has one */
function refusalBody(text: string): { code?: string; message?: string } {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof body !== 'object' || body === null) return {};
  const { code, message } = body as { code?: unknown; message?: unknown };
  return {
    ...(typeof code === 'string' ? { code } : {}),
    ...(typeof message === 'string' ? { message } : {})
  };
}
