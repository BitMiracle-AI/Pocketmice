import type { ClientErrorCode, Failure } from '@pocketmice/client/api';
import type { DeclaredErrorCode, ErrorCode } from '@pocketmice/contract/errors';

/**
 * Why a call failed. Either a code the server answered with (the list, and what each means, is in the contract's
 * errors.ts), or one of the three this side arrives at by itself: UNREACHABLE, the server could not be reached;
 * BAD_RESPONSE, it was reached, but what came back is not what was agreed; UNEXPECTED, the request failed on this
 * side in a way that is not the network: what the method was given cannot be sent, or the fetch that was passed in
 * gave up. cause is what was thrown, when something was.
 */
export type PocketmiceErrorCode = ErrorCode | ClientErrorCode;

/**
 * What a method throws when it fails, and the only thing one throws. Decide what to do by code. message is English,
 * for logs and developers.
 */
export class PocketmiceError extends Error {
  /** What to decide by */
  readonly code: PocketmiceErrorCode;
  /** The method that failed, like getFile or uploadFile */
  readonly operation: string;

  constructor(code: PocketmiceErrorCode, message: string, operation: string, cause?: unknown) {
    // Without a cause none is set: an error that says "cause: undefined" reads as if one went missing
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'PocketmiceError';
    this.code = code;
    this.operation = operation;
  }
}

/**
 * The error to throw for a failure the client arrived at. What was thrown on this side, if anything was, is its
 * cause.
 */
export function errorOf(failure: Failure<DeclaredErrorCode>, operation: string): PocketmiceError {
  return new PocketmiceError(failure.code, failure.message, operation, failure.cause);
}
