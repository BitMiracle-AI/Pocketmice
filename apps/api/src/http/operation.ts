import { ERROR_STATUS, type ErrorBody, type ErrorCode, isUniversalErrorCode } from '@pocketmice/contract/errors';
import { type CheckedInputOf, type Operation, type OutputOf, operationPath } from '@pocketmice/contract/operation';
import type { Context, Hono } from 'hono';

/** The input of one request is at most this large, in bytes. An input is JSON; files do not come this way */
export const MAX_INPUT_BYTES = 1024 * 1024;

const INTERNAL_MESSAGE = 'The server ran into an internal error.';

/** What an implementation is given: the input, checked against the definition */
interface HandlerContext<Op extends Operation> {
  input: CheckedInputOf<Op>;
}

/**
 * An operation together with its implementation. The exact types of the input and the output were matched up in
 * implement, and are not carried along here.
 */
export interface Implementation {
  operation: Operation;
  run: (input: unknown) => Promise<unknown>;
}

/**
 * What an implementation throws to refuse a request. code must be one the operation lists, or one any operation may
 * answer with; throwing any other code is a mistake in the implementation, and the caller gets INTERNAL.
 * When there is a reason behind the refusal worth recording, put it in cause: it goes to the log, never to the
 * caller.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: { cause: unknown }) {
    super(message, options);
    this.code = code;
  }
}

/**
 * Writes the implementation of an operation from its definition. The types of the input and of the output come
 * from the definition: an implementation that does not match it fails the type check.
 */
export function implement<Op extends Operation>(
  operation: Op,
  handler: (context: HandlerContext<Op>) => Promise<OutputOf<Op>>
): Implementation {
  return {
    operation,
    // By the time this runs the input has been checked against the definition (see handle), so the assertion holds
    run: (input) => handler({ input: input as CheckedInputOf<Op> })
  };
}

export interface OperationDeps {
  /** Every operation the api implements */
  implementations: Implementation[];
  /** The web pages allowed to call the api. A request from any other web page is refused */
  webOrigins: string[];
  /**
   * Called when the server itself fails, to record why. The caller only ever gets INTERNAL and never sees the
   * reason. where is the name of the operation that failed, or the address of the request when it failed before
   * reaching an operation.
   */
  reportError: (error: unknown, where: string) => void;
}

/**
 * Mounts every operation on the app, each at POST /api/<its name>.
 * It also takes over the response in two cases, so that however a request fails the caller gets the same error
 * body: there is nothing at the address, and an error nobody caught was thrown while handling the request.
 */
export function mountOperations(app: Hono, deps: OperationDeps): void {
  const mounted = new Set<string>();

  for (const implementation of deps.implementations) {
    const { name } = implementation.operation;
    if (mounted.has(name)) throw new Error(`Operation ${name} is implemented more than once.`);
    mounted.add(name);

    app.post(operationPath(implementation.operation), (c) => handle(c, implementation, deps));
  }

  app.notFound((c) => fail(c, 'UNKNOWN_OPERATION', `There is no endpoint at ${c.req.method} ${c.req.path}.`));

  app.onError((error, c) => {
    deps.reportError(error, c.req.path);
    return fail(c, 'INTERNAL', INTERNAL_MESSAGE);
  });
}

/**
 * Whether a request is let in. Every request passes through here before the implementation runs, and the first
 * check it fails decides the response: how large the body is, which web page it comes from, whether the body fits
 * the definition. A request that passes yields the checked input.
 */
async function admit(c: Context, operation: Operation, deps: OperationDeps): Promise<{ input: unknown } | Response> {
  // How large the body is, is read from the length the request declares, without reading the body: that what is
  // sent is as long as what was declared is guaranteed by the HTTP server.
  // The body must not be touched just to measure it. Several of the steps below answer without reading the body,
  // and a body that was started on and not read to the end cannot be drained by the HTTP server: half a second
  // after answering, it closes the connection by force. A reverse proxy in front keeps that connection for reuse,
  // and the next request it sends down it is lost (502) — which may be somebody else's request.
  const declaredLength = c.req.header('content-length');
  if (declaredLength !== undefined && Number(declaredLength) > MAX_INPUT_BYTES) {
    return fail(c, 'INPUT_TOO_LARGE', `The request body is larger than ${MAX_INPUT_BYTES} bytes.`);
  }
  // A body sent in chunks declares no length, so its size cannot be known without reading it: it is not accepted.
  // fetch, curl and every common HTTP library declare the length of a JSON body.
  if (c.req.header('transfer-encoding') !== undefined) {
    return fail(c, 'INVALID_INPUT', 'Send the request body with a content-length header, not in chunks.');
  }

  // A browser always sends the origin with a request to another site, so a web page that is not on the list is
  // refused here, whatever else its request carries. Callers that are not browsers send no origin.
  const origin = c.req.header('origin');
  if (origin !== undefined && !deps.webOrigins.includes(origin)) {
    return fail(c, 'FORBIDDEN', 'Requests from this origin are not allowed.');
  }

  if (!c.req.header('content-type')?.toLowerCase().startsWith('application/json')) {
    return fail(c, 'INVALID_INPUT', 'The request body must be JSON, sent with content-type application/json.');
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, 'INVALID_INPUT', 'The request body is not valid JSON.');
  }
  const input = operation.input.safeParse(body);
  if (!input.success) return fail(c, 'INVALID_INPUT', describeIssues(input.error.issues));

  return { input: input.data };
}

/** Handles one request to an operation. If a check fails, the implementation does not run */
async function handle(c: Context, { operation, run }: Implementation, deps: OperationDeps): Promise<Response> {
  const { name } = operation;
  const admitted = await admit(c, operation, deps);
  if (admitted instanceof Response) return admitted;

  let result: unknown;
  try {
    result = await run(admitted.input);
  } catch (thrown) {
    if (!(thrown instanceof ApiError)) {
      deps.reportError(thrown, name);
      return fail(c, 'INTERNAL', INTERNAL_MESSAGE);
    }
    if (isUniversalErrorCode(thrown.code) || operation.errors.some((declared) => declared === thrown.code)) {
      // The implementation attached the reason behind this refusal: record it. The caller sees only the code and
      // the message
      if (thrown.cause !== undefined) deps.reportError(thrown.cause, name);
      return fail(c, thrown.code, thrown.message);
    }
    // The codes a definition lists are what callers write their branches from: an implementation must not answer
    // with one the definition does not have
    deps.reportError(
      new Error(`Operation ${name} threw error code ${thrown.code}, which its definition does not list.`, {
        cause: thrown
      }),
      name
    );
    return fail(c, 'INTERNAL', INTERNAL_MESSAGE);
  }

  // Checked against the definition once more before it is sent. A field the definition does not have is dropped
  // here, so whatever else an implementation returns (a whole database row, say) never leaks to the caller
  const output = operation.output.safeParse(result);
  if (!output.success) {
    deps.reportError(
      new Error(
        `Operation ${name} returned a value that does not match its definition: ${describeIssues(output.error.issues)}`
      ),
      name
    );
    return fail(c, 'INTERNAL', INTERNAL_MESSAGE);
  }
  return c.json(output.data, 200);
}

/** A failed response: the error code decides the status, and the body is the one error body */
function fail(c: Context, code: ErrorCode, message: string): Response {
  const body: ErrorBody = { error: { code, message } };
  return c.json(body, ERROR_STATUS[code]);
}

/** Writes what failed a check as one sentence: which field, and what is wrong with it */
function describeIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  return issues.map((issue) => `${issue.path.map(String).join('.') || '(body)'}: ${issue.message}`).join('; ');
}
