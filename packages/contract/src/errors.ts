import { z } from 'zod';

/**
 * The errors any operation may answer with, and the HTTP status of each. The layer that receives requests raises
 * them itself, so an operation does not list them in its definition.
 * A caller decides what to do by the code alone. The status is there for proxies, logs and alerts.
 */
export const UNIVERSAL_ERROR_STATUS = {
  /** The request does not fit the operation's definition: the input is wrong, or the body is not JSON */
  INVALID_INPUT: 400,
  /** The request body is over the size limit */
  INPUT_TOO_LARGE: 413,
  /** The request comes from a web page that this server does not allow to call it */
  FORBIDDEN: 403,
  /** The server has no such operation */
  UNKNOWN_OPERATION: 404,
  /** The server itself failed. The reason goes to the server's log only, never to the caller */
  INTERNAL: 500
} as const;

/**
 * The errors an operation only answers with when its definition lists them. A new code is added here, then listed
 * on every operation that can answer with it.
 */
export const DECLARED_ERROR_STATUS = {
  /** The thing asked for does not exist */
  NOT_FOUND: 404,
  /** The request conflicts with how things are now: for example, the thing to create already exists */
  CONFLICT: 409
} as const;

export type UniversalErrorCode = keyof typeof UNIVERSAL_ERROR_STATUS;
export type DeclaredErrorCode = keyof typeof DECLARED_ERROR_STATUS;
export type ErrorCode = UniversalErrorCode | DeclaredErrorCode;

/** The HTTP status of every error code */
export const ERROR_STATUS = { ...UNIVERSAL_ERROR_STATUS, ...DECLARED_ERROR_STATUS };

export function isUniversalErrorCode(code: string): code is UniversalErrorCode {
  return Object.hasOwn(UNIVERSAL_ERROR_STATUS, code);
}

/**
 * The body of a failed response. A successful response has no wrapper: its body is the output the operation
 * defines.
 */
export const errorBody = z.object({
  error: z.object({
    code: z.string(),
    /** English, for logs and developers. What to tell a person is up to each caller, decided by the code */
    message: z.string()
  })
});

export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}
