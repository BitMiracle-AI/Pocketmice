import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SIGN_IN_PATH,
  SIGN_OUT_PATH,
  SIGN_UP_PATH,
  signInBody,
  signOutBody,
  signUpBody
} from '@pocketmice/contract/domains/auth';
import type { Db } from '@pocketmice/db';
import * as authSchema from '@pocketmice/db/schema/auth';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { describeError } from '../../http/errorLog.ts';
import type { Identified } from '../../http/operation.ts';

/**
 * The limit on the addresses for signing in and signing up, counted separately for each "IP and address".
 * It is not "this many a minute". The library's rule is: a request from the same IP to the same address, less than
 * a minute after the last one that was let through, counts on; once the count reaches this number every request is
 * refused, until a full minute has passed since the last one that was let through, and then the count starts again.
 * The library's default is far stricter (3 in 10 seconds and the like). Many people in an office or a school share
 * one outgoing IP, and they would be the ones refused, so it is relaxed.
 */
export const SIGN_IN_ATTEMPT_LIMIT = 30;

/**
 * A request body for the sign-in library is at most this large, in bytes. The largest a page sends is a sign-up,
 * a few hundred bytes. These addresses need no sign-in and the library stores some of what they are sent, so the
 * limit is tight.
 */
export const MAX_AUTH_INPUT_BYTES = 16 * 1024;

/**
 * Of the addresses of the sign-in library (under /api/auth) only these are open, and each accepts only the body
 * written for it in the contract. Every other address is closed (app.ts mounts these alone); a body with a field
 * that is not written there, without one that is, or with one spelled wrong is refused whole and never reaches the
 * library.
 *
 * Why down to the field: the library comes with many addresses, each accepting many fields, and every field is a
 * way of using it. What we have no use for and leave open is an extra way in. Only what a page really sends is
 * accepted, so a field or a use the library adds later does not come in either.
 * A request with no body counts as {}.
 *
 * startsSession: a success at this address starts a session, so what every signed-in person must have is made
 * ready before the cookie is handed over (see createAuth).
 */
export const AUTH_ROUTES = [
  { method: 'POST', path: SIGN_UP_PATH, body: signUpBody, startsSession: true },
  { method: 'POST', path: SIGN_IN_PATH, body: signInBody, startsSession: true },
  { method: 'POST', path: SIGN_OUT_PATH, body: signOutBody, startsSession: false }
] as const;

export interface AuthDeps {
  db: Db;
  /** The secret that signs sessions */
  secret: string;
  /** The address of the api as callers reach it, like http://localhost:11210 */
  apiUrl: string;
  /**
   * The web pages allowed to call the api. The library refuses a request that carries a cookie and comes from an
   * origin not on this list. A request without a cookie it does not check; those are kept out by the browser's
   * rules about other origins, from the same list (see app.ts).
   */
  webOrigins: string[];
  /**
   * Called after a session has been started and before its cookie is handed over, with the id of the user. What
   * every signed-in person must have is made ready here; which things those are is in domains/prepareSignIn.ts.
   * If it throws, the request fails and the cookie is not handed over.
   */
  prepareSignIn: (userId: string) => Promise<void>;
  /**
   * Called when the library fails in a way nobody foresaw while handling a request (the database is gone, say), to
   * record why. The caller never sees the reason. where is the method and the address of that request.
   */
  reportError: (error: unknown, where: string) => void;
}

/**
 * Signing in. A person signs up with an email address, a password and the name they go by, and signs in with the
 * address and the password. The library stores the password (as a hash), checks it, starts the session and sets
 * the cookie. An address is not verified by sending mail to it: a server that someone runs themselves has no
 * outgoing mail unless they set it up.
 *
 * The library's tables hold who can sign in and how. The name someone goes by is in their profile
 * (schema/profile.ts in packages/db): the name given at sign-up goes into the library's users table, and from
 * there into the profile when the profile is made.
 *
 * What comes back is the library's object with its handler replaced by our own layer, which first checks a request
 * against AUTH_ROUTES and only then passes it on.
 */
export function createAuth({ db, secret, apiUrl, webOrigins, prepareSignIn, reportError }: AuthDeps) {
  const auth = betterAuth({
    secret,
    baseURL: apiUrl,
    trustedOrigins: webOrigins,
    // transaction: the steps the library needs to succeed or fail together (making the user, their password and
    // their first session) go into one database transaction. The adapter leaves it off by default: then, when the
    // password is not stored, the user's row is already there, and that email address can neither sign in nor sign
    // up again.
    // It is also why what a signed-in person must have is made ready after the library has answered, not in one of
    // its hooks: inside the transaction, the user's row cannot be seen from any other connection yet
    database: drizzleAdapter(db, { provider: 'pg', usePlural: true, schema: authSchema, transaction: true }),
    advanced: {
      database: { generateId: 'uuid' },
      // Cookies are not kept apart by port: on one machine, another project that uses this library would overwrite
      // the default cookie name
      cookiePrefix: 'pocketmice'
    },
    // The table definitions (schema/auth.ts in packages/db) are generated from this configuration by the library's
    // tool
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH
    },
    // throw: when the library fails in a way nobody foresaw, it neither prints nor answers by itself; it throws to
    // our layer (the handler below). Printing by itself, it would print the error as it is, and an error from the
    // database has the parameters of the query on it (email addresses, session tokens), see http/errorLog.ts
    onAPIError: { throw: true },
    // Whatever else the library wants printed (warnings, errors it caught itself) goes through describeError first,
    // for the same reason
    logger: {
      log(level, message, ...details) {
        const print = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
        print([`[auth] ${message}`, ...details.map((detail) => describeError(detail))].join('\n'));
      }
    },
    // The library's default is to limit only when NODE_ENV is production, so a missing environment variable would
    // switch the protection off; here it is always on.
    // The counts are kept in the memory of this process, separately for each "IP and address". The IP is only taken
    // from the x-forwarded-for a reverse proxy reports, and only when it holds a single address; without the header
    // the IP is unknown and everyone shares one count.
    // An address with no rule of its own has the library's default: 100 in 10 seconds, counted as described at
    // SIGN_IN_ATTEMPT_LIMIT.
    rateLimit: {
      enabled: true,
      customRules: {
        '/sign-in/email': { window: 60, max: SIGN_IN_ATTEMPT_LIMIT },
        '/sign-up/email': { window: 60, max: SIGN_IN_ATTEMPT_LIMIT }
      }
    }
  });

  /** Our answer when we refuse a request. It has the shape of the library's own failures, { code, message } */
  const refuse = (status: number, code: string, message: string) => Response.json({ code, message }, { status });
  const internal = () => refuse(500, 'INTERNAL_SERVER_ERROR', 'The server ran into an internal error.');

  /**
   * Hands a request to the library and returns its answer. Null when it failed in a way nobody foresaw: the reason
   * has been recorded, and what to answer is up to the caller of this function.
   * Both count: it threw (see onAPIError above), and it answered with a 5xx itself (then what is recorded is the
   * sentence in its answer).
   */
  async function ask(request: Request, where: string): Promise<Response | null> {
    let response: Response;
    try {
      response = await auth.handler(request);
    } catch (error) {
      reportError(error, where);
      return null;
    }
    if (response.status < 500) return response;
    const said = await response.text().catch(() => '');
    reportError(new Error(`The auth library answered with status ${response.status}: ${said.slice(0, 300)}`), where);
    return null;
  }

  /**
   * A session has just been started: makes ready what every signed-in person must have, then answers. started is
   * the library's answer, which holds the user and the cookie.
   * The library's answer is not passed on. Its body carries the session token, which a page has no use for and
   * should not be able to read: the cookie that holds it is kept from scripts. The answer is an empty object with
   * the library's cookies.
   * When making ready fails, the cookie is not handed over. The session the library made stays in the database
   * with nobody holding it; signing in again starts another and makes ready what was missing.
   */
  async function handOver(started: Response, where: string): Promise<Response> {
    const body = (await started.json().catch(() => null)) as { user?: { id?: unknown } } | null;
    const userId = body?.user?.id;
    if (typeof userId !== 'string') {
      reportError(new Error('The auth library started a session and did not say for which user.'), where);
      return internal();
    }
    try {
      await prepareSignIn(userId);
    } catch (error) {
      reportError(error, where);
      return internal();
    }
    const headers = new Headers({ 'content-type': 'application/json' });
    for (const cookie of started.headers.getSetCookie()) headers.append('set-cookie', cookie);
    return new Response('{}', { status: 200, headers });
  }

  /**
   * Every request under /api/auth comes here first. An address that is not in AUTH_ROUTES, and a body that does
   * not fit the rule of its address, are refused here; only what passes is handed to the library.
   * The body the library gets is written out again from the rule, with the fields of the rule and no others.
   */
  async function handler(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const where = `${request.method} ${pathname}`;
    const route = AUTH_ROUTES.find(({ method, path }) => method === request.method && path === pathname);
    if (!route) return refuse(404, 'NOT_FOUND', `There is no endpoint at ${where}.`);

    // The size is read from the declared length, without reading the body; a body sent in chunks declares none and
    // is not accepted. The reasons are the same as for an operation (see admit in http/operation.ts)
    if (Number(request.headers.get('content-length') ?? 0) > MAX_AUTH_INPUT_BYTES) {
      return refuse(413, 'BODY_TOO_LARGE', `The request body is larger than ${MAX_AUTH_INPUT_BYTES} bytes.`);
    }
    if (request.headers.has('transfer-encoding')) {
      return refuse(400, 'INVALID_BODY', 'Send the request body with a content-length header, not in chunks.');
    }
    const text = await request.text();
    // A body must be declared as JSON. A browser asks first (a preflight) before it sends JSON to another site, and
    // does not ask for other types: with no other type accepted, no other site can send a request here unseen
    if (text !== '' && !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return refuse(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'The request body must be JSON, sent with content-type application/json.'
      );
    }
    let json: unknown = {};
    try {
      if (text !== '') json = JSON.parse(text);
    } catch {
      return refuse(400, 'INVALID_BODY', 'The request body is not valid JSON.');
    }
    const body = route.body.safeParse(json);
    if (!body.success) {
      const issues = body.error.issues.map((issue) => `${issue.path.join('.') || '(body)'}: ${issue.message}`);
      return refuse(400, 'INVALID_BODY', issues.join('; '));
    }
    const headers = new Headers(request.headers);
    // The body was written out again and its length changed; the new request works out its own
    headers.delete('content-length');
    const response = await ask(
      new Request(request.url, {
        method: request.method,
        headers,
        // A request that had no body (signing out, say) is not given one out of nowhere
        body: text === '' ? undefined : JSON.stringify(body.data)
      }),
      where
    );
    if (!response) return internal();
    return route.startsSession && response.ok ? handOver(response, where) : response;
  }

  return { ...auth, handler };
}

/**
 * How an operation finds out who is calling: with a valid sign-in cookie on the request, user is that person;
 * otherwise null. "Who is this request from" is asked of the library alone; the layer of the operations does not
 * read cookies itself.
 *
 * While identifying, the library may have a cookie for the browser, which is handed on for that layer to add to the
 * response: when a session was last extended a day ago or more, the library extends it and issues a new cookie, so
 * the cookie in the browser moves along with it; when the session has ended, it tells the browser to delete the
 * cookie.
 * Only cookies are passed on. The library's other response headers (no caching, say) speak of its own response, not
 * of ours.
 */
export function currentUserFrom(auth: ReturnType<typeof createAuth>) {
  return async (headers: Headers): Promise<Identified> => {
    const { response: session, headers: fromAuth } = await auth.api.getSession({ headers, returnHeaders: true });

    const responseHeaders = new Headers();
    for (const cookie of fromAuth.getSetCookie()) responseHeaders.append('set-cookie', cookie);

    const user = session && { id: session.user.id, email: session.user.email };
    return { user, responseHeaders };
  };
}
