import { requestSignInCode as definition } from '@pocketmice/contract/domains/auth';
import { ApiError, implement } from '../../http/operation.ts';
import { ipLimitKey, rateLimit, takeAll } from '../../http/rateLimit.ts';
import type { SignIn } from './auth.ts';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * One IP asks for at most this many codes a minute. It is loose: many people in an office or a school share one
 * outgoing IP. What it stops is one sender having mail sent to address after address without pause.
 * Of an IPv6 address the first half counts (see ipLimitKey in http/rateLimit.ts).
 */
export const REQUESTS_PER_IP_PER_MINUTE = 30;

/**
 * One email address is sent at most this many codes a minute, and this many a day. It stops two things:
 * - this server being used to fill somebody's mailbox;
 * - a code being guessed. A code stops working after SIGN_IN_CODE_WRONG_TRIES wrong tries, and then another can be
 *   asked for, so the guesses there are in a day are "codes a day times wrong tries a code" (times the number of
 *   api processes, see below). That is why a day allows so few: nobody signing in needs more.
 * The price: anyone who knows an address can use up its codes for the day, and the person it belongs to cannot
 * sign in on a new device until the next day. Nothing here stops that; proving that a caller is a person, before
 * the address is counted, would.
 */
export const CODES_PER_ADDRESS_PER_MINUTE = 5;
export const CODES_PER_ADDRESS_PER_DAY = 20;

/** Every request whose IP cannot be told (see clientIpOf in http/operation.ts) counts under this one name */
const UNKNOWN_IP = 'unknown';

/**
 * Sends a sign-in code to an email address. On a server that signs people in with a password the operation is
 * answered like one the server does not have. Otherwise two limits come first, and the one that is full ends it:
 * how often this IP asked, then how often this address was sent a code. Only then is a code made and sent.
 * The counts are kept in the memory of this process (see http/rateLimit.ts): with several api processes, what is
 * let through is at most these limits times the number of processes.
 */
export function requestSignInCode({ signIn, now }: { signIn: SignIn; now?: () => number }) {
  // now tells the time for the limits. Left out, the clock; a test passes one of its own
  const perIp = [rateLimit(REQUESTS_PER_IP_PER_MINUTE, MINUTE_MS, now)];
  const perAddress = [
    rateLimit(CODES_PER_ADDRESS_PER_MINUTE, MINUTE_MS, now),
    rateLimit(CODES_PER_ADDRESS_PER_DAY, DAY_MS, now)
  ];

  return implement(definition, async ({ input, clientIp }) => {
    if (signIn.method !== 'emailCode') {
      throw new ApiError('UNKNOWN_OPERATION', 'This server signs people in with a password and sends no codes.');
    }
    if (!takeAll(perIp, clientIp === null ? UNKNOWN_IP : ipLimitKey(clientIp))) {
      throw new ApiError('TOO_MANY_REQUESTS', 'Too many sign-in codes were asked for from this address. Try later.');
    }
    // The address is lowercase by now (see signInEmail in the contract): one count for every spelling of it
    if (!takeAll(perAddress, input.email)) {
      throw new ApiError('TOO_MANY_REQUESTS', `Too many sign-in codes were sent to ${input.email}. Try later.`);
    }

    try {
      await signIn.sendCode(input.email);
    } catch (error) {
      // Why it did not go out is for the server's log (cause), not for the caller
      throw new ApiError('CODE_NOT_SENT', 'The sign-in code could not be sent.', { cause: error });
    }
    return {};
  });
}
