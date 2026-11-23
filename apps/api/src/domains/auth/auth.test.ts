import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { apiKeyAuthorization } from '@pocketmice/contract/domains/apiKey';
import {
  CODE_SIGN_IN_PATH,
  SIGN_IN_CODE_WRONG_TRIES,
  SIGN_IN_PATH,
  SIGN_OUT_PATH,
  SIGN_UP_PATH
} from '@pocketmice/contract/domains/auth';
import { connectDb, type Db } from '@pocketmice/db';
import { apiKeys } from '@pocketmice/db/schema/apiKey';
import { accounts, sessions, users, verifications } from '@pocketmice/db/schema/auth';
import { profiles } from '@pocketmice/db/schema/profile';
import { spaceMembers } from '@pocketmice/db/schema/space';
import { createTestDb, type TestDb } from '@pocketmice/db/testing';
import { eq } from 'drizzle-orm';
import { createApp } from '../../app.ts';
import { requireEnv } from '../../env.ts';
import type { Email } from '../../external/mail/mailer.ts';
import type { FileStorage } from '../../storage/fileStorage.ts';
import { deleteAllApiKeys } from '../apiKey/deleteAllApiKeys.ts';
import { identifyCaller } from '../apiKey/identifyCaller.ts';
import { domainImplementations } from '../implementations.ts';
import { prepareSignIn } from '../prepareSignIn.ts';
import { findMembership } from '../space/findMembership.ts';
import { createAuth, identifyBySession, MAX_AUTH_INPUT_BYTES, SIGN_IN_ATTEMPT_LIMIT } from './auth.ts';

// The sign-in library for real, on a temporary database of this file. The api around it is put together the way
// main.ts does it, so what is tested here is what runs.
const WEB_ORIGIN = 'http://localhost:11211';
const SESSION_COOKIE = 'pocketmice.session_token';

let testDb: TestDb;
let db: Db;

before(async () => {
  testDb = await createTestDb(requireEnv('DATABASE_URL'));
  db = connectDb(testDb.url);
});

after(async () => {
  // Disconnect first, then drop: a database someone is connected to cannot be dropped
  await db?.$client.end();
  await testDb?.drop();
});

/** Every request of a test comes from an IP of its own unless it says otherwise, so the tests do not use up each other's tries */
let lastIp = 0;
const nextIp = () => `203.0.113.${++lastIp}`;

interface Options {
  /** What is made ready for someone who signs in. Left out, the real thing */
  prepare?: (userId: string) => Promise<void>;
  /** The database the sign-in library works on. Left out, the database of this file */
  authDb?: Db;
  /**
   * Whether this server can send mail, and so signs people in with a code and not with a password. Left out, it
   * cannot. No mail goes anywhere: what would be sent is collected in sent.
   */
  mail?: boolean;
}

/**
 * An api with the sign-in library for real. What the server reported about itself is collected in reported, and
 * the mails it sent in sent.
 */
function setup({ prepare, authDb = db, mail = false }: Options = {}) {
  const reported: { error: unknown; where: string }[] = [];
  const reportError = (error: unknown, where: string) => reported.push({ error, where });
  const sent: Email[] = [];
  const auth = createAuth({
    db: authDb,
    secret: 'test-secret-0123456789abcdef0123456789abcdef',
    apiUrl: 'http://localhost:11210',
    webOrigins: [WEB_ORIGIN],
    sendEmail: mail
      ? async (email) => {
          sent.push(email);
        }
      : null,
    prepareSignIn: prepare ?? ((userId) => prepareSignIn(db, userId)),
    revokeUnprovenAccess: (userId) => deleteAllApiKeys(db, userId),
    reportError
  });
  const app = createApp({
    auth,
    webOrigins: [WEB_ORIGIN],
    // No test here touches a file: the storage is never asked for anything
    implementations: domainImplementations({
      db,
      storage: {} as FileStorage,
      version: '1.2.3',
      signIn: auth.signIn,
      reportError
    }),
    identifyCaller: identifyCaller(db, identifyBySession(auth)),
    spaceMembership: (spaceId, userId) => findMembership(db, spaceId, userId),
    reportError
  });
  const ip = nextIp();

  /**
   * Sends a request the way a web page does. A value in headers replaces the default header of that name; null
   * leaves the header out.
   */
  function post(path: string, body: unknown, headers: Record<string, string | null> = {}) {
    const merged = new Headers({ origin: WEB_ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': ip });
    for (const [header, value] of Object.entries(headers)) {
      if (value === null) merged.delete(header);
      else merged.set(header, value);
    }
    return app.request(path, {
      method: 'POST',
      headers: merged,
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });
  }

  /** Calls an operation with this cookie: its output, or the error code */
  async function call(name: string, input: unknown, cookie: string | null) {
    const response = await post(`/api/${name}`, input, { cookie });
    const body = (await response.json()) as { error?: { code: string } };
    return body.error?.code ?? body;
  }

  /** The caller's profile as the api sees it with this cookie: the profile, or the error code */
  const profile = (cookie: string | null) => call('getProfile', {}, cookie);

  /** Asks for a sign-in code for this address, and reads it from the mail that was sent */
  async function codeFor(email: string): Promise<string> {
    assert.deepEqual(await call('requestSignInCode', { email }, null), {});
    // The mail goes to the address as it is stored: lowercase, without the spaces around it
    const to = email.trim().toLowerCase();
    const code = /^Your sign-in code is (\d+)\.$/m.exec(sent.findLast((mail) => mail.to === to)?.text ?? '')?.[1];
    assert.ok(code, `no mail with a code was sent to ${to}`);
    return code;
  }

  return { post, call, profile, reported, sent, codeFor };
}

/** An account nobody has used in this file yet */
let lastAccount = 0;
function newAccount() {
  return { name: 'Ada', email: `ada-${++lastAccount}@example.com`, password: 'correct horse battery' };
}

/** The session cookie a response sets, as it goes into a cookie header; null when it sets none or clears it */
function sessionCookie(response: Response): string | null {
  for (const cookie of response.headers.getSetCookie()) {
    const [pair = ''] = cookie.split(';');
    if (pair.startsWith(`${SESSION_COOKIE}=`) && pair.length > SESSION_COOKIE.length + 1) return pair;
  }
  return null;
}

/** The status of a failed response and the code in its body */
async function refusal(response: Response) {
  const body = (await response.json()) as { code?: string };
  return [response.status, body.code];
}

test('signing up makes the account, signs the caller in, and makes their profile; they are in no space', async () => {
  const { post, call, profile, reported } = setup();
  const account = newAccount();

  const response = await post(SIGN_UP_PATH, account);

  assert.equal(response.status, 200);
  // The body says nothing: the session token is in the cookie alone, and the cookie is kept from scripts
  assert.deepEqual(await response.json(), {});
  const [cookie = ''] = response.headers.getSetCookie().filter((value) => value.startsWith(SESSION_COOKIE));
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.match(cookie, /; Path=\//);

  const [user] = await db.select().from(users).where(eq(users.email, account.email));
  assert.ok(user);
  assert.equal(user.name, 'Ada');
  assert.deepEqual(await profile(sessionCookie(response)), { id: user.id, email: account.email, name: 'Ada' });

  // The password is stored as a hash, never as it was typed
  const [credential] = await db.select().from(accounts).where(eq(accounts.userId, user.id));
  assert.equal(credential?.providerId, 'credential');
  assert.ok(credential?.password && !credential.password.includes(account.password));

  // The profile has the name given at sign-up
  assert.deepEqual(await db.select({ name: profiles.name }).from(profiles).where(eq(profiles.id, user.id)), [
    { name: 'Ada' }
  ]);
  // Nothing else is made for them: the server never makes a space for anyone
  assert.deepEqual(await call('getSpaces', {}, sessionCookie(response)), { spaces: [] });
  assert.equal((await db.select().from(spaceMembers).where(eq(spaceMembers.userId, user.id))).length, 0);
  assert.deepEqual(reported, []);
});

test('the email address is trimmed and lowercased, the name trimmed: signing in with any spelling finds the account', async () => {
  const { post, profile } = setup();
  const account = newAccount();

  const signedUp = await post(SIGN_UP_PATH, {
    ...account,
    name: '  Ada Lovelace ',
    email: `  ${account.email.toUpperCase()} `
  });
  assert.equal(signedUp.status, 200);

  const signedIn = await post(SIGN_IN_PATH, { email: ` ${account.email.toUpperCase()}`, password: account.password });
  assert.equal(signedIn.status, 200);
  const mine = (await profile(sessionCookie(signedIn))) as { email: string; name: string };
  assert.equal(mine.email, account.email);
  assert.equal(mine.name, 'Ada Lovelace');
});

test('signing up with an address that has an account is refused, and makes no second account', async () => {
  const { post } = setup();
  const account = newAccount();
  await post(SIGN_UP_PATH, account);

  const again = await post(SIGN_UP_PATH, { ...account, password: 'another password' });

  assert.deepEqual(await refusal(again), [422, 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL']);
  assert.equal(sessionCookie(again), null);
  assert.equal((await db.select().from(users).where(eq(users.email, account.email))).length, 1);
});

test('signing in again leaves the name in the profile as the person changed it', async () => {
  const { post, call, profile } = setup();
  const account = newAccount();
  const first = sessionCookie(await post(SIGN_UP_PATH, account));
  await call('updateProfile', { name: 'Ada Lovelace' }, first);
  await post(SIGN_OUT_PATH, {}, { cookie: first });

  const again = await post(SIGN_IN_PATH, { email: account.email, password: account.password });

  const mine = (await profile(sessionCookie(again))) as { name: string };
  assert.equal(mine.name, 'Ada Lovelace');
});

test('signing in with the right password signs the caller in', async () => {
  const { post, profile } = setup();
  const account = newAccount();
  await post(SIGN_UP_PATH, account);

  const response = await post(SIGN_IN_PATH, { email: account.email, password: account.password });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {});
  const mine = (await profile(sessionCookie(response))) as { email: string };
  assert.equal(mine.email, account.email);
});

test('a wrong password and an address with no account get the same answer, and no cookie', async () => {
  const { post } = setup();
  const account = newAccount();
  await post(SIGN_UP_PATH, account);

  const wrong = await post(SIGN_IN_PATH, { email: account.email, password: 'not the password' });
  const unknown = await post(SIGN_IN_PATH, { email: 'nobody@example.com', password: account.password });
  // Shorter than a password can be: answered like any wrong password
  const short = await post(SIGN_IN_PATH, { email: account.email, password: 'x' });

  for (const response of [wrong, unknown, short]) {
    assert.equal(sessionCookie(response), null);
    assert.deepEqual(await refusal(response), [401, 'INVALID_EMAIL_OR_PASSWORD']);
  }
});

test('signing out ends the session: the cookie is cleared, and the old cookie is no longer signed in', async () => {
  const { post, profile } = setup();
  const signedUp = await post(SIGN_UP_PATH, newAccount());
  const cookie = sessionCookie(signedUp);
  assert.ok(cookie);
  assert.notEqual(await profile(cookie), 'UNAUTHENTICATED');

  const response = await post(SIGN_OUT_PATH, {}, { cookie });

  assert.equal(response.status, 200);
  assert.equal(sessionCookie(response), null);
  assert.ok(
    response.headers.getSetCookie().some((value) => value.startsWith(`${SESSION_COOKIE}=;`)),
    'the response should tell the browser to delete the cookie'
  );
  assert.equal(await profile(cookie), 'UNAUTHENTICATED');
});

test('a made-up cookie, and none at all, are not signed in', async () => {
  const { profile } = setup();

  assert.equal(await profile(null), 'UNAUTHENTICATED');
  assert.equal(await profile(`${SESSION_COOKIE}=made-up.signature`), 'UNAUTHENTICATED');
});

test('a body with a field that is not written for the address, or without one that is, never reaches the library', async () => {
  const { post } = setup();
  const account = newAccount();

  for (const body of [
    // The library would take each of these and act on it
    { ...account, image: 'https://example.com/a.png' },
    { ...account, callbackURL: 'https://evil.example' },
    { ...account, rememberMe: false },
    { ...account, role: 'admin' },
    { email: account.email, password: account.password },
    { ...account, password: 'short' },
    { ...account, email: 'not an address' },
    { ...account, name: '   ' },
    [],
    null
  ]) {
    assert.deepEqual(await refusal(await post(SIGN_UP_PATH, body)), [400, 'INVALID_BODY'], JSON.stringify(body));
  }
  assert.deepEqual(
    await refusal(await post(SIGN_IN_PATH, { email: account.email, password: account.password, rememberMe: false })),
    [400, 'INVALID_BODY']
  );
  assert.deepEqual(await refusal(await post(SIGN_OUT_PATH, { all: true })), [400, 'INVALID_BODY']);

  assert.equal((await db.select().from(users).where(eq(users.email, account.email))).length, 0);
});

test('a body that is not JSON, not sent as JSON, too large or sent in chunks is refused', async () => {
  const { post } = setup();
  const account = newAccount();

  assert.deepEqual(await refusal(await post(SIGN_UP_PATH, '{"email":')), [400, 'INVALID_BODY']);
  // A form: another site could send one without the browser asking first
  assert.deepEqual(
    await refusal(
      await post(SIGN_UP_PATH, `email=${account.email}&password=${account.password}&name=Ada`, {
        'content-type': 'application/x-www-form-urlencoded'
      })
    ),
    [415, 'UNSUPPORTED_MEDIA_TYPE']
  );
  assert.deepEqual(await refusal(await post(SIGN_UP_PATH, account, { 'content-type': null })), [
    415,
    'UNSUPPORTED_MEDIA_TYPE'
  ]);
  assert.deepEqual(
    await refusal(await post(SIGN_UP_PATH, account, { 'content-length': String(MAX_AUTH_INPUT_BYTES + 1) })),
    [413, 'BODY_TOO_LARGE']
  );
  assert.deepEqual(await refusal(await post(SIGN_UP_PATH, account, { 'transfer-encoding': 'chunked' })), [
    400,
    'INVALID_BODY'
  ]);

  assert.equal((await db.select().from(users).where(eq(users.email, account.email))).length, 0);
});

test('a request with the sign-in cookie from a web page that is not on the list is refused by the library', async () => {
  const { post } = setup();
  const cookie = sessionCookie(await post(SIGN_UP_PATH, newAccount()));
  assert.ok(cookie);

  const response = await post(SIGN_OUT_PATH, {}, { cookie, origin: 'https://evil.example' });

  assert.equal(response.status, 403);
});

test('what every signed-in person must have cannot be made ready: the sign-in fails, no cookie is handed over, and trying again works', async () => {
  const account = newAccount();
  const broken = setup({
    prepare: async () => {
      throw new Error('the database said no');
    }
  });

  const failed = await broken.post(SIGN_UP_PATH, account);
  const text = await failed.text();

  assert.equal(failed.status, 500);
  assert.deepEqual(JSON.parse(text), {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'The server ran into an internal error.'
  });
  assert.equal(failed.headers.getSetCookie().length, 0);
  assert.equal(broken.reported.length, 1);
  assert.equal(broken.reported[0]?.where, `POST ${SIGN_UP_PATH}`);
  assert.match(String(broken.reported[0]?.error), /the database said no/);

  // The account was made, and the profile was not: signing in again makes it
  const [user] = await db.select().from(users).where(eq(users.email, account.email));
  assert.ok(user);
  assert.equal((await db.select().from(profiles).where(eq(profiles.id, user.id))).length, 0);

  const working = setup();
  const signedIn = await working.post(SIGN_IN_PATH, { email: account.email, password: account.password });
  assert.equal(signedIn.status, 200);
  assert.ok(sessionCookie(signedIn));
  assert.equal((await db.select().from(profiles).where(eq(profiles.id, user.id))).length, 1);
  assert.deepEqual(await working.profile(sessionCookie(signedIn)), { id: user.id, email: account.email, name: 'Ada' });
});

test('the library fails in a way nobody foresaw: the caller gets an internal error without the reason, and it is reported', async () => {
  // A connection of its own to the same database, already closed: every statement on it fails
  const closed = connectDb(testDb.url);
  await closed.$client.end();
  const { post, reported } = setup({ authDb: closed });

  const response = await post(SIGN_IN_PATH, { email: 'ada@example.com', password: 'correct horse battery' });
  const text = await response.text();

  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(text), {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'The server ran into an internal error.'
  });
  assert.equal(reported.length, 1);
  assert.equal(reported[0]?.where, `POST ${SIGN_IN_PATH}`);
});

test('signing in is limited for each IP, also outside production: past the limit a request is refused, another IP is not', async () => {
  const { post } = setup();
  const attempt = (ip?: string) =>
    post(SIGN_IN_PATH, { email: 'nobody@example.com', password: 'x' }, ip ? { 'x-forwarded-for': ip } : {});

  const statuses = [];
  for (let tries = 0; tries < SIGN_IN_ATTEMPT_LIMIT; tries++) statuses.push((await attempt()).status);
  assert.deepEqual([...new Set(statuses)], [401]);

  assert.equal((await attempt()).status, 429);
  assert.equal((await attempt(nextIp())).status, 401);
});

test('a session that was signed out leaves no row behind', async () => {
  const { post } = setup();
  const account = newAccount();
  const cookie = sessionCookie(await post(SIGN_UP_PATH, account));
  const [user] = await db.select().from(users).where(eq(users.email, account.email));
  assert.ok(user && cookie);
  assert.equal((await db.select().from(sessions).where(eq(sessions.userId, user.id))).length, 1);

  await post(SIGN_OUT_PATH, {}, { cookie });

  assert.equal((await db.select().from(sessions).where(eq(sessions.userId, user.id))).length, 0);
});

test('a session last extended over a day ago is extended when it is used, and the browser is handed the new cookie', async () => {
  const { post } = setup();
  const account = newAccount();
  const cookie = sessionCookie(await post(SIGN_UP_PATH, account));
  const [user] = await db.select().from(users).where(eq(users.email, account.email));
  assert.ok(user && cookie);
  // A session started just now is left as it is
  assert.equal(sessionCookie(await post('/api/getProfile', {}, { cookie })), null);

  // A session lasts seven days from when it was last extended: this one has five left
  const DAY_MS = 24 * 60 * 60 * 1000;
  const inFiveDays = new Date(Date.now() + 5 * DAY_MS);
  await db.update(sessions).set({ expiresAt: inFiveDays }).where(eq(sessions.userId, user.id));

  const response = await post('/api/getProfile', {}, { cookie });

  assert.equal(response.status, 200);
  // Without the new cookie the browser keeps the one from the day of sign-in, which runs out: someone who comes
  // every day would still be signed out after a week
  assert.ok(sessionCookie(response), 'the response should hand the browser a new cookie');
  const [session] = await db.select().from(sessions).where(eq(sessions.userId, user.id));
  assert.ok(session && session.expiresAt.getTime() > inFiveDays.getTime() + DAY_MS, 'the session should be extended');
});

test('an API key made while signed in calls as that person, with no cookie; a key that does not exist is nobody, also beside a cookie that is signed in', async () => {
  const { post, call, profile } = setup();
  const account = newAccount();
  const cookie = sessionCookie(await post(SIGN_UP_PATH, account));
  assert.ok(cookie);
  const made = (await call('createApiKey', { name: 'Research agent', permission: 'read' }, cookie)) as {
    apiKey: { key: string };
  };

  /** The email address of whoever this key calls as, or the error code. Sent the way an agent does: no web page */
  async function calledWith(key: string, withCookie: string | null) {
    const headers = { origin: null, cookie: withCookie, authorization: apiKeyAuthorization(key) };
    const body = (await (await post('/api/getProfile', {}, headers)).json()) as {
      email?: string;
      error?: { code: string };
    };
    return body.error?.code ?? body.email;
  }

  assert.equal(await calledWith(made.apiKey.key, null), account.email);
  const noSuchKey = `pm_${'x'.repeat(43)}`;
  assert.equal(await calledWith(noSuchKey, null), 'UNAUTHENTICATED');
  // The session beside it is not looked at
  assert.equal(await calledWith(noSuchKey, cookie), 'UNAUTHENTICATED');
  assert.notEqual(await profile(cookie), 'UNAUTHENTICATED');
});

// From here on: signing in with a code, on a server that can send mail.

/** An address nobody has used in this file yet */
function newAddress() {
  return `grace-${++lastAccount}@example.com`;
}

/** A code that is not this one */
function otherThan(code: string): string {
  return code === '000000' ? '111111' : '000000';
}

test('a server says how people sign in, and the addresses of the other way are not there', async () => {
  const withPassword = setup();
  const withCode = setup({ mail: true });
  const account = newAccount();

  assert.deepEqual(await withPassword.call('getServerInfo', {}, null), { version: '1.2.3', signInMethod: 'password' });
  assert.deepEqual(await withCode.call('getServerInfo', {}, null), { version: '1.2.3', signInMethod: 'emailCode' });

  assert.equal(await withPassword.call('requestSignInCode', { email: account.email }, null), 'UNKNOWN_OPERATION');
  assert.deepEqual(await refusal(await withPassword.post(CODE_SIGN_IN_PATH, { email: account.email, otp: '123456' })), [
    404,
    'NOT_FOUND'
  ]);

  assert.deepEqual(await refusal(await withCode.post(SIGN_UP_PATH, account)), [404, 'NOT_FOUND']);
  assert.deepEqual(
    await refusal(await withCode.post(SIGN_IN_PATH, { email: account.email, password: account.password })),
    [404, 'NOT_FOUND']
  );
  assert.equal((await db.select().from(users).where(eq(users.email, account.email))).length, 0);
  // Signing out is the same on both
  assert.equal((await withCode.post(SIGN_OUT_PATH, {})).status, 200);
  assert.equal((await withPassword.post(SIGN_OUT_PATH, {})).status, 200);
});

test('a code is sent by mail, and signing in with it makes the account: the caller is signed in under the first part of their address, in no space', async () => {
  const { post, call, profile, reported, sent, codeFor } = setup({ mail: true });
  const email = newAddress();

  const code = await codeFor(` ${email.toUpperCase()} `);

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.to, email);
  assert.equal(sent[0]?.subject, 'Your Pocketmice sign-in code');
  assert.match(code, /^\d{6}$/);
  assert.match(sent[0]?.text ?? '', /It works for 5 minutes\./);
  // Asking makes no account
  assert.equal((await db.select().from(users).where(eq(users.email, email))).length, 0);

  const response = await post(CODE_SIGN_IN_PATH, { email, otp: code });

  assert.equal(response.status, 200);
  // The body says nothing: the session token is in the cookie alone, and the cookie is kept from scripts
  assert.deepEqual(await response.json(), {});
  const [cookie = ''] = response.headers.getSetCookie().filter((value) => value.startsWith(SESSION_COOKIE));
  assert.match(cookie, /; HttpOnly/);

  const [user] = await db.select().from(users).where(eq(users.email, email));
  assert.ok(user);
  // The code proved the address. No name was asked for, and there is no password
  assert.equal(user.emailVerified, true);
  assert.equal(user.name, '');
  assert.equal((await db.select().from(accounts).where(eq(accounts.userId, user.id))).length, 0);
  const name = email.slice(0, email.indexOf('@'));
  assert.deepEqual(await profile(sessionCookie(response)), { id: user.id, email, name });
  assert.deepEqual(await call('getSpaces', {}, sessionCookie(response)), { spaces: [] });
  assert.deepEqual(reported, []);
});

test('signing in with a code again finds the same account, and leaves the name as the person changed it', async () => {
  const { post, call, profile, codeFor } = setup({ mail: true });
  const email = newAddress();
  const first = sessionCookie(await post(CODE_SIGN_IN_PATH, { email, otp: await codeFor(email) }));
  await call('updateProfile', { name: 'Grace Hopper' }, first);
  await post(SIGN_OUT_PATH, {}, { cookie: first });

  const again = await post(CODE_SIGN_IN_PATH, { email: email.toUpperCase(), otp: await codeFor(email) });

  assert.equal(again.status, 200);
  assert.equal(((await profile(sessionCookie(again))) as { name: string }).name, 'Grace Hopper');
  assert.equal((await db.select().from(users).where(eq(users.email, email))).length, 1);
});

test('a code works once, and only the last one sent to an address works', async () => {
  const { post, codeFor } = setup({ mail: true });
  const email = newAddress();

  const first = await codeFor(email);
  const second = await codeFor(email);
  // Six digits: once in a million the two are the same
  if (first !== second) {
    assert.deepEqual(await refusal(await post(CODE_SIGN_IN_PATH, { email, otp: first })), [400, 'INVALID_OTP']);
  }
  assert.equal((await post(CODE_SIGN_IN_PATH, { email, otp: second })).status, 200);

  const used = await post(CODE_SIGN_IN_PATH, { email, otp: second });
  assert.deepEqual(await refusal(used), [400, 'INVALID_OTP']);
  assert.equal(sessionCookie(used), null);
  // The code before it did not come back when the last one was used
  assert.deepEqual(await refusal(await post(CODE_SIGN_IN_PATH, { email, otp: first })), [400, 'INVALID_OTP']);
  assert.equal(
    (
      await db
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, `sign-in-otp-${email}`))
    ).length,
    0
  );
});

test('a wrong code is refused and may be tried again; wrong too often, the right one no longer works either', async () => {
  const { post, codeFor } = setup({ mail: true });
  const email = newAddress();

  const code = await codeFor(email);
  const wrong = await post(CODE_SIGN_IN_PATH, { email, otp: otherThan(code) });
  assert.deepEqual(await refusal(wrong), [400, 'INVALID_OTP']);
  assert.equal(sessionCookie(wrong), null);
  assert.equal((await post(CODE_SIGN_IN_PATH, { email, otp: code })).status, 200);

  const next = await codeFor(email);
  for (let tries = 0; tries < SIGN_IN_CODE_WRONG_TRIES; tries++) {
    assert.deepEqual(await refusal(await post(CODE_SIGN_IN_PATH, { email, otp: otherThan(next) })), [
      400,
      'INVALID_OTP'
    ]);
  }
  assert.deepEqual(await refusal(await post(CODE_SIGN_IN_PATH, { email, otp: next })), [403, 'TOO_MANY_ATTEMPTS']);
  // A new code works
  assert.equal((await post(CODE_SIGN_IN_PATH, { email, otp: await codeFor(email) })).status, 200);
});

test('a code that has expired, and an address that was sent none, are refused, and no account is made', async () => {
  const { post, codeFor } = setup({ mail: true });
  const email = newAddress();

  assert.deepEqual(await refusal(await post(CODE_SIGN_IN_PATH, { email, otp: '123456' })), [400, 'INVALID_OTP']);

  const code = await codeFor(email);
  await db
    .update(verifications)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(verifications.identifier, `sign-in-otp-${email}`));
  assert.deepEqual(await refusal(await post(CODE_SIGN_IN_PATH, { email, otp: code })), [400, 'OTP_EXPIRED']);

  assert.equal((await db.select().from(users).where(eq(users.email, email))).length, 0);
});

test('signing in with a code takes the address and the code, and no field the library would act on', async () => {
  const { post, codeFor } = setup({ mail: true });
  const email = newAddress();
  const code = await codeFor(email);

  for (const body of [
    // The library would give a new account this name and this picture
    { email, otp: code, name: 'Mallory' },
    { email, otp: code, image: 'https://example.com/a.png' },
    { email, otp: code, role: 'admin' },
    { email },
    { otp: code },
    { email, otp: '12345' },
    { email, otp: '1234567' },
    { email, otp: 'abcdef' },
    { email: 'not an address', otp: code }
  ]) {
    assert.deepEqual(await refusal(await post(CODE_SIGN_IN_PATH, body)), [400, 'INVALID_BODY'], JSON.stringify(body));
  }

  assert.equal((await db.select().from(users).where(eq(users.email, email))).length, 0);
  // None of them reached the library: the code has all its tries left
  assert.equal((await post(CODE_SIGN_IN_PATH, { email, otp: code })).status, 200);
});

test('signing in with a code is limited for each IP like signing in with a password, not by the three a minute of the library', async () => {
  const { post } = setup({ mail: true });
  const attempt = (ip?: string) =>
    post(CODE_SIGN_IN_PATH, { email: 'nobody@example.com', otp: '123456' }, ip ? { 'x-forwarded-for': ip } : {});

  const statuses = [];
  for (let tries = 0; tries < SIGN_IN_ATTEMPT_LIMIT; tries++) statuses.push((await attempt()).status);
  assert.deepEqual([...new Set(statuses)], [400]);

  assert.equal((await attempt()).status, 429);
  assert.equal((await attempt(nextIp())).status, 400);
});

test('an account made with a password, on a server that now sends mail: the first code takes away its password, its sessions and its API keys, and keeps the rest', async () => {
  const before = setup();
  const account = newAccount();
  const oldCookie = sessionCookie(await before.post(SIGN_UP_PATH, account));
  assert.ok(oldCookie);
  const made = (await before.call('createApiKey', { name: 'Research agent', permission: 'write' }, oldCookie)) as {
    apiKey: { id: string; key: string };
  };
  const { space } = (await before.call('createSpace', { name: 'Research' }, oldCookie)) as { space: { id: string } };
  const [user] = await db.select().from(users).where(eq(users.email, account.email));
  assert.ok(user);
  assert.equal(user.emailVerified, false);

  const now = setup({ mail: true });
  const withKey = async (key: string) => {
    const headers = { origin: null, authorization: apiKeyAuthorization(key) };
    const body = (await (await now.post('/api/getProfile', {}, headers)).json()) as { error?: { code: string } };
    return body.error?.code ?? 'works';
  };
  // Until the address is proven the account is whoever made it: their session and their key go on working
  assert.notEqual(await now.profile(oldCookie), 'UNAUTHENTICATED');
  assert.equal(await withKey(made.apiKey.key), 'works');
  // A wrong code takes nothing away
  const code = await now.codeFor(account.email);
  await now.post(CODE_SIGN_IN_PATH, { email: account.email, otp: otherThan(code) });
  assert.equal(await withKey(made.apiKey.key), 'works');

  const response = await now.post(CODE_SIGN_IN_PATH, { email: account.email, otp: code });

  assert.equal(response.status, 200);
  const cookie = sessionCookie(response);
  // The same account, with its name and its space
  assert.deepEqual(await now.profile(cookie), { id: user.id, email: account.email, name: 'Ada' });
  const { spaces } = (await now.call('getSpaces', {}, cookie)) as { spaces: { id: string }[] };
  assert.deepEqual(
    spaces.map(({ id }) => id),
    [space.id]
  );
  // What let someone in before is gone: the password, the session, the key. The key's row stays, marked
  assert.equal((await db.select().from(accounts).where(eq(accounts.userId, user.id))).length, 0);
  assert.equal(await now.profile(oldCookie), 'UNAUTHENTICATED');
  assert.equal(await withKey(made.apiKey.key), 'UNAUTHENTICATED');
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, made.apiKey.id));
  assert.ok(row?.deletedAt);
  assert.deepEqual(await now.call('getApiKeys', {}, cookie), { apiKeys: [] });
  assert.deepEqual(now.reported, []);

  // Once: a key made from now on stays when they sign in again
  const kept = (await now.call('createApiKey', { name: 'Research agent', permission: 'read' }, cookie)) as {
    apiKey: { key: string };
  };
  const again = await now.post(CODE_SIGN_IN_PATH, { email: account.email, otp: await now.codeFor(account.email) });
  assert.equal(again.status, 200);
  assert.equal(await withKey(kept.apiKey.key), 'works');
  assert.notEqual(await now.profile(cookie), 'UNAUTHENTICATED');
});

test('what every signed-in person must have cannot be made ready after a code: no cookie is handed over, and a new code works', async () => {
  const email = newAddress();
  const broken = setup({
    mail: true,
    prepare: async () => {
      throw new Error('the database said no');
    }
  });

  const failed = await broken.post(CODE_SIGN_IN_PATH, { email, otp: await broken.codeFor(email) });

  assert.equal(failed.status, 500);
  assert.equal(failed.headers.getSetCookie().length, 0);
  assert.equal(broken.reported.length, 1);
  assert.equal(broken.reported[0]?.where, `POST ${CODE_SIGN_IN_PATH}`);

  const working = setup({ mail: true });
  const signedIn = await working.post(CODE_SIGN_IN_PATH, { email, otp: await working.codeFor(email) });
  assert.equal(signedIn.status, 200);
  assert.notEqual(await working.profile(sessionCookie(signedIn)), 'UNAUTHENTICATED');
});
