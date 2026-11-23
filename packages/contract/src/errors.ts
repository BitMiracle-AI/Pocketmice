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
  /**
   * The operation is not public, and this request carries no valid proof of who is calling: no session, and no API
   * key that works
   */
  UNAUTHENTICATED: 401,
  /**
   * The caller is known and is not allowed to do this: their role in the space is too low, or the API key the
   * request came with may not call the operation. Or the request comes from a web page that this server does not
   * allow to call it
   */
  FORBIDDEN: 403,
  /**
   * The operation belongs to a space, and the space the input names does not exist for the caller: there is no
   * such space, or the caller is not a member of it. Both get the same answer, so someone who is not a member
   * cannot find out whether a space exists.
   */
  UNKNOWN_SPACE: 404,
  /**
   * The operation belongs to a conversation, and the conversation the input names does not exist for the caller:
   * the space has no such conversation, or the caller cannot read it. Both get the same answer, so someone who is
   * not in a conversation cannot find out whether it exists.
   */
  UNKNOWN_CONVERSATION: 404,
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
  CONFLICT: 409,
  /** This was asked for too often, from where this request comes from or for the same thing. Later it works again */
  TOO_MANY_REQUESTS: 429,
  /** A sign-in code was to be sent, and the mail did not go out. Asking again may work */
  CODE_NOT_SENT: 503,
  /**
   * What was sent would be kept, and the space may hold no more of it: its storage limit would be passed. Sending
   * it again does not help until the owner of the space makes room or raises the limit.
   * The status of the two below is the one of INPUT_TOO_LARGE, and not one that says the server has no room
   * (507): to a proxy and to an alert that would be the server failing, and this is a limit somebody set.
   */
  SPACE_STORAGE_LIMIT_EXCEEDED: 413,
  /**
   * The same for the caller alone: the space has room, and the limit the owner set for this member would be
   * passed
   */
  MEMBER_STORAGE_LIMIT_EXCEEDED: 413
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
