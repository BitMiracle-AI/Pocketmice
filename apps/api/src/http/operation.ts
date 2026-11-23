import { isIP } from 'node:net';
import type { ApiKeyPermission } from '@pocketmice/contract/domains/apiKey';
import { ERROR_STATUS, type ErrorBody, type ErrorCode, isUniversalErrorCode } from '@pocketmice/contract/errors';
import {
  type CheckedInputOf,
  type OpenTo,
  type Operation,
  type OutputOf,
  operationPath
} from '@pocketmice/contract/operation';
import { roleCovers, type SpaceRole } from '@pocketmice/contract/spaceRole';
import type { Context, Hono } from 'hono';

/** The input of one request is at most this large, in bytes. An input is JSON; files do not come this way */
export const MAX_INPUT_BYTES = 1024 * 1024;

/** All a caller is told when the server itself fails. Why it failed is for the log (see reportError) */
export const INTERNAL_MESSAGE = 'The server ran into an internal error.';

/**
 * The person calling an operation: themselves, signed in, or an agent calling with one of their API keys. Either
 * way what is done is done as this person. Which of the two it was never decides what an implementation does; it is
 * handed on only to be recorded (see apiKeyId in HandlerContext).
 * What else there is to know about them (the name they go by) is in their profile, and is read there by the
 * implementations that need it.
 */
export interface CurrentUser {
  id: string;
  /** The email address they sign in with */
  email: string;
}

/** What identifying the caller yields */
export interface Identified {
  /** The person calling; null when the request proves nobody */
  user: CurrentUser | null;
  /**
   * The API key the request was sent with, when that is how the caller is known. Left out, the person signed in
   * themselves.
   */
  apiKey?: { id: string; permission: ApiKeyPermission };
  /**
   * Response headers that whoever identified the caller wants sent to the client, if any. This layer adds them to
   * the response of this request as they are, whether it succeeds or fails.
   * Today that is the cookie of the sign-in library: the new cookie after a session was extended, or the order to
   * delete the cookie of a session that has ended. Not passed on, the session would be extended in the database
   * while the browser kept the cookie from the day of sign-in, which runs out: someone who uses the product every
   * day would still be signed out.
   */
  responseHeaders?: Headers;
}

/** What the caller is in the space that spaceId in the input names */
export interface Membership {
  role: SpaceRole;
}

/** What the caller is to the conversation that conversationId in the input names */
export interface ConversationAccess {
  /** Whether they are a member of it */
  member: boolean;
}

/**
 * What an implementation is given: the input, checked against the definition, and the IP the request came from.
 * For an operation that is not public, also the person calling. For an operation of a space or of a conversation,
 * also what the caller is in that space — getting it means the caller is a member, in a role the operation accepts.
 * An operation of a conversation is given nothing more: that it runs means the conversation is in that space and
 * is open to the caller.
 * apiKeyId is the API key the request came with, or null when the person signed in themselves. It is there to be
 * written down next to what was done (which key wrote this version of a file), and for nothing else: what the
 * caller may do was settled before the implementation ran, and an implementation never branches on it.
 */
type HandlerContext<Op extends Operation> = {
  input: CheckedInputOf<Op>;
  /**
   * The IP the request came from; null when it cannot be told (see clientIpOf). An operation anyone may call
   * limits by it how often it is called
   */
  clientIp: string | null;
} & (Op['access'] extends 'public' ? unknown : { user: CurrentUser; apiKeyId: string | null }) &
  (Op['belongsTo'] extends 'space' | 'conversation' ? { membership: Membership } : unknown);

/**
 * An operation together with its implementation. The exact types of the input and the output were matched up in
 * implement, and are not carried along here.
 */
export interface Implementation {
  operation: Operation;
  run: (input: unknown, caller: Caller) => Promise<unknown>;
}

/**
 * What this layer found out and hands to the implementation: who is calling, and from where. Which parts are set
 * depends on the definition
 */
export interface Caller extends AdmittedCaller {
  membership: Membership | null;
  clientIp: string | null;
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
 * Writes the implementation of an operation from its definition. The types of the input, of the caller and of the
 * output come from the definition: an implementation that does not match it fails the type check.
 */
export function implement<Op extends Operation>(
  operation: Op,
  handler: (context: HandlerContext<Op>) => Promise<OutputOf<Op>>
): Implementation {
  return {
    operation,
    // By the time this runs the input has been checked against the definition, an operation that is not public
    // knows who is calling, and an operation of a space or of a conversation knows the caller is a member (see
    // admit), so the assertion holds
    run: (input, { user, apiKeyId, membership, clientIp }) =>
      handler({
        input,
        clientIp,
        ...(user && { user, apiKeyId }),
        ...(membership && { membership })
      } as unknown as HandlerContext<Op>)
  };
}

/**
 * What it takes to tell whether a caller is let in. The operations take it, and so does every entrance that is not
 * an operation and checks its callers the same way.
 */
export interface AdmissionDeps {
  /**
   * Tells who is calling from the request headers, and whether it is the person themselves or an API key of
   * theirs. Asked once for every call of an operation that is not public.
   */
  identifyCaller: (headers: Headers) => Promise<Identified>;
  /**
   * What this person is in this space. Null when the space does not exist for them: there is no such space, or
   * they are not a member. Asked once for every call of an operation of a space.
   */
  spaceMembership: (spaceId: string, userId: string) => Promise<Membership | null>;
  /**
   * What this person is to this conversation of this space. Null when that space has no such conversation. Asked
   * once for every call of an operation of a conversation, after the caller was found to be a member of the space.
   */
  conversationAccess: (spaceId: string, conversationId: string, userId: string) => Promise<ConversationAccess | null>;
  /** The web pages allowed to call the api. A request from any other web page is refused */
  webOrigins: string[];
  /**
   * Called when the server itself fails, to record why. The caller only ever gets INTERNAL and never sees the
   * reason. where is the name of the operation that failed, or the address of the request when it failed before
   * reaching an operation.
   */
  reportError: (error: unknown, where: string) => void;
}

export interface OperationDeps extends AdmissionDeps {
  /** Every operation the api implements */
  implementations: Implementation[];
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

/** What an entrance asks of its caller: the two things an operation states in its definition */
export interface Gate {
  access: Operation['access'];
  kind: Operation['kind'];
}

/** Who got past admitCaller: the person, and the API key the request came with when that is how they are known */
export interface AdmittedCaller {
  /** Null only where anyone may call */
  user: CurrentUser | null;
  /** Null when the person signed in themselves */
  apiKeyId: string | null;
}

/**
 * The first half of letting a request in: which web page it comes from, who is calling, and what the API key it
 * came with may do. It does not read the body.
 * The operations pass through it (see admit), and so do the entrances that are not operations, like the address
 * the content of files goes through: whoever may not call an operation does not get the same thing done another
 * way.
 */
export async function admitCaller(c: Context, gate: Gate, deps: AdmissionDeps): Promise<AdmittedCaller | Response> {
  // A browser always sends the origin with a request to another site, so a web page that is not on the list is
  // refused here, whether or not its request carries the sign-in cookie. Callers that are not browsers send no
  // origin, and they do not carry somebody else's cookie either.
  const origin = c.req.header('origin');
  if (origin !== undefined && !deps.webOrigins.includes(origin)) {
    return fail(c, 'FORBIDDEN', 'Requests from this origin are not allowed.');
  }
  if (gate.access === 'public') return { user: null, apiKeyId: null };

  const identified = await deps.identifyCaller(c.req.raw.headers);
  // Whoever identified the caller has something for the client (a renewed cookie, say): it goes onto the response
  // now, and stays there however the rest of this request turns out
  identified.responseHeaders?.forEach((value, name) => {
    c.header(name, value, { append: true });
  });
  const { user, apiKey } = identified;
  if (!user) {
    const how = gate.access === 'session' ? 'Sign in' : 'Sign in, or send a valid API key,';
    return fail(c, 'UNAUTHENTICATED', `${how} to do this.`);
  }

  // The request came with an API key. A key only ever narrows what the person it belongs to may do: it never does
  // what is kept for the person themselves, and a read-only key never changes anything
  if (apiKey && gate.access === 'session') {
    return fail(c, 'FORBIDDEN', 'This cannot be done with an API key: sign in to do it.');
  }
  if (apiKey?.permission === 'read' && gate.kind === 'write') {
    return fail(c, 'FORBIDDEN', 'This API key is read-only, and this request changes something.');
  }

  return { user, apiKeyId: apiKey?.id ?? null };
}

/**
 * The second half, for what belongs to a space: the caller must be a member of the space, in a role that is
 * enough. Checked here once, so nothing that works inside a space has to remember to.
 */
export async function admitMember(
  c: Context,
  spaceId: string,
  minRole: SpaceRole,
  user: CurrentUser,
  deps: AdmissionDeps
): Promise<Membership | Response> {
  const membership = await deps.spaceMembership(spaceId, user.id);
  // Not a member and no such space get one answer: someone who is not a member cannot find out whether a space
  // exists
  if (!membership) return fail(c, 'UNKNOWN_SPACE', `There is no space ${spaceId}, or you are not a member of it.`);
  if (!roleCovers(membership.role, minRole)) {
    return fail(c, 'FORBIDDEN', `This takes the role ${minRole} in the space, and yours is ${membership.role}.`);
  }
  return membership;
}

/**
 * What follows the second half for what belongs to a conversation: the conversation is one of the space, and it is
 * open to the caller. membership is what admitMember answered with for that space.
 * Who can read a conversation is written here and nowhere else: its members, and the owner of the space.
 */
export async function admitToConversation(
  c: Context,
  spaceId: string,
  conversationId: string,
  openTo: OpenTo,
  user: CurrentUser,
  membership: Membership,
  deps: AdmissionDeps
): Promise<ConversationAccess | Response> {
  const access = await deps.conversationAccess(spaceId, conversationId, user.id);
  // No such conversation and one the caller cannot read get one answer: someone who is not in a conversation
  // cannot find out whether it exists
  if (!access || (!access.member && !roleCovers(membership.role, 'owner'))) {
    return fail(
      c,
      'UNKNOWN_CONVERSATION',
      `Space ${spaceId} has no conversation ${conversationId}, or you are not a member of it.`
    );
  }
  // Left is the owner of the space, who reads the conversation without being in it
  if (!access.member && openTo === 'member') {
    return fail(
      c,
      'FORBIDDEN',
      'This takes being a member of the conversation. As the owner of the space you can read it; to do this, add yourself to it first.'
    );
  }
  return access;
}

/**
 * Whether a request to an operation is let in. Every request passes through here before the implementation runs,
 * and the first check it fails decides the response: how large the body is, which web page it comes from, who is
 * calling, what the API key it came with may do, whether the body fits the definition, whether the caller is a
 * member of the space, whether their role there is enough, whether the conversation is open to them.
 * A request that passes yields the checked input and who is calling. Whether the caller may call the operation at
 * all is settled here, for every operation alike: an implementation does not check it again.
 */
async function admit(
  c: Context,
  operation: Operation,
  deps: OperationDeps
): Promise<{ input: unknown; caller: Caller } | Response> {
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

  const admitted = await admitCaller(c, operation, deps);
  if (admitted instanceof Response) return admitted;

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

  let membership: Membership | null = null;
  if (operation.belongsTo !== 'none') {
    // The types of a definition guarantee what is thrown for below (see operation in the contract). Reaching one of
    // these lines means someone wrote a definition around the types
    const { name, belongsTo, minRole, openTo } = operation;
    if (!admitted.user) throw new Error(`Operation ${name} belongs to a ${belongsTo}, so it must not be public.`);
    const { spaceId, conversationId } = input.data as { spaceId?: unknown; conversationId?: unknown };
    if (typeof spaceId !== 'string') {
      throw new Error(`Operation ${name} belongs to a ${belongsTo}, so its input must have a spaceId.`);
    }
    if (!minRole) throw new Error(`Operation ${name} belongs to a ${belongsTo}, so it must state a minRole.`);

    const member = await admitMember(c, spaceId, minRole, admitted.user, deps);
    if (member instanceof Response) return member;
    membership = member;

    if (belongsTo === 'conversation') {
      if (typeof conversationId !== 'string') {
        throw new Error(`Operation ${name} belongs to a conversation, so its input must have a conversationId.`);
      }
      if (!openTo) throw new Error(`Operation ${name} belongs to a conversation, so it must state who it is open to.`);

      const access = await admitToConversation(c, spaceId, conversationId, openTo, admitted.user, member, deps);
      if (access instanceof Response) return access;
    }
  }

  return { input: input.data, caller: { ...admitted, membership, clientIp: clientIpOf(c.req.raw.headers) } };
}

/**
 * The IP a request came from, read from x-forwarded-for: the reverse proxy in front sets it to the one address the
 * request came from, in place of whatever the client sent (see main.ts), which is why it can be believed.
 * Null when it cannot be told: there is no such header, it holds more than one address, or what it holds is not an
 * IP. The sign-in library tells the IP for its own limit by the same rule (see rateLimit in domains/auth/auth.ts).
 */
function clientIpOf(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')?.trim();
  return forwarded && isIP(forwarded) !== 0 ? forwarded : null;
}

/** Handles one request to an operation. If a check fails, the implementation does not run */
async function handle(c: Context, { operation, run }: Implementation, deps: OperationDeps): Promise<Response> {
  const { name } = operation;
  const admitted = await admit(c, operation, deps);
  if (admitted instanceof Response) return admitted;

  let result: unknown;
  try {
    result = await run(admitted.input, admitted.caller);
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
export function fail(c: Context, code: ErrorCode, message: string): Response {
  const body: ErrorBody = { error: { code, message } };
  return c.json(body, ERROR_STATUS[code]);
}

/** Writes what failed a check as one sentence: which field, and what is wrong with it */
export function describeIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  return issues.map((issue) => `${issue.path.map(String).join('.') || '(body)'}: ${issue.message}`).join('; ');
}
