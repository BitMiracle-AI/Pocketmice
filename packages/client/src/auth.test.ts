import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ApiClientConfig } from './api.ts';
import { createAuthClient } from './auth.ts';

type Sent = Parameters<ApiClientConfig['fetch']>;

/**
 * A client whose fetch is a stand-in: it records what was sent and answers with `answer`, or does what `fetch`
 * does. Errors this side reports are collected in `reported`.
 * How the real sign-in library answers is not tested here: the tests of the api send these same requests to it
 * (domains/auth/auth.test.ts there).
 */
function setup(answer: { status: number; body: string } | ApiClientConfig['fetch']) {
  const sent: Sent[] = [];
  const reported: { error: unknown; name: string }[] = [];
  const auth = createAuthClient({
    baseUrl: 'https://api.example.com',
    fetch: async (...args) => {
      sent.push(args);
      if (typeof answer === 'function') return answer(...args);
      return { status: answer.status, text: async () => answer.body };
    },
    reportError: (error, name) => reported.push({ error, name })
  });
  return { auth, sent, reported };
}

const refused = (status: number, code: string) => ({
  status,
  body: JSON.stringify({ code, message: `Said ${code}.` })
});

test('each request is a POST of JSON to its address, and a success says no more than that it worked', async () => {
  const { auth, sent } = setup({ status: 200, body: '{}' });

  assert.deepEqual(await auth.signUp({ name: 'Ada', email: 'ada@example.com', password: 'long enough' }), { ok: true });
  assert.deepEqual(await auth.signIn({ email: 'ada@example.com', password: 'long enough' }), { ok: true });
  assert.deepEqual(await auth.signInWithCode({ email: 'ada@example.com', code: '123456' }), { ok: true });
  assert.deepEqual(await auth.signOut(), { ok: true });

  const headers = { 'content-type': 'application/json' };
  assert.deepEqual(sent, [
    [
      'https://api.example.com/api/auth/sign-up/email',
      { method: 'POST', headers, body: '{"name":"Ada","email":"ada@example.com","password":"long enough"}' }
    ],
    [
      'https://api.example.com/api/auth/sign-in/email',
      { method: 'POST', headers, body: '{"email":"ada@example.com","password":"long enough"}' }
    ],
    [
      'https://api.example.com/api/auth/sign-in/email-otp',
      { method: 'POST', headers, body: '{"email":"ada@example.com","otp":"123456"}' }
    ],
    ['https://api.example.com/api/auth/sign-out', { method: 'POST', headers, body: '{}' }]
  ]);
});

test('a code the address is known to refuse with is passed on as the library names it', async () => {
  const taken = await setup(refused(422, 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL')).auth.signUp({
    name: 'Ada',
    email: 'ada@example.com',
    password: 'long enough'
  });
  assert.deepEqual(taken, {
    ok: false,
    code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
    message: 'Said USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL.'
  });

  const wrong = await setup(refused(401, 'INVALID_EMAIL_OR_PASSWORD')).auth.signIn({
    email: 'a@example.com',
    password: 'x'
  });
  assert.equal(!wrong.ok && wrong.code, 'INVALID_EMAIL_OR_PASSWORD');

  const byCode = (status: number, code: string) =>
    setup(refused(status, code)).auth.signInWithCode({ email: 'a@example.com', code: '123456' });
  for (const [status, code] of [
    [400, 'INVALID_OTP'],
    [400, 'OTP_EXPIRED'],
    [403, 'TOO_MANY_ATTEMPTS']
  ] as const) {
    const result = await byCode(status, code);
    assert.equal(!result.ok && result.code, code);
  }
});

test('a code another address refuses with is not one this address is known for: BAD_RESPONSE', async () => {
  const result = await setup(refused(400, 'INVALID_OTP')).auth.signIn({ email: 'a@example.com', password: 'x' });

  assert.equal(!result.ok && result.code, 'BAD_RESPONSE');
  assert.match(!result.ok ? result.message : '', /INVALID_OTP/);
});

test('asked too often: the library says so with the status alone', async () => {
  const { auth } = setup({ status: 429, body: '{"message":"Too many requests. Please try again later."}' });

  assert.deepEqual(await auth.signIn({ email: 'a@example.com', password: 'x' }), {
    ok: false,
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many requests. Please try again later.'
  });
  // Whatever the body is
  const bare = await setup({ status: 429, body: '' }).auth.signOut();
  assert.equal(!bare.ok && bare.code, 'TOO_MANY_REQUESTS');
});

test('what the server refuses before the library sees it gets the code an operation would have got', async () => {
  for (const [status, said, code] of [
    [400, 'INVALID_BODY', 'INVALID_INPUT'],
    [415, 'UNSUPPORTED_MEDIA_TYPE', 'INVALID_INPUT'],
    [413, 'BODY_TOO_LARGE', 'INPUT_TOO_LARGE'],
    [404, 'NOT_FOUND', 'UNKNOWN_OPERATION'],
    [500, 'INTERNAL_SERVER_ERROR', 'INTERNAL']
  ] as const) {
    const result = await setup(refused(status, said)).auth.signIn({ email: 'a@example.com', password: 'x' });
    assert.equal(!result.ok && result.code, code, said);
  }
});

test('a 403 with a code this side does not know is the caller not let in: FORBIDDEN', async () => {
  const result = await setup(refused(403, 'INVALID_ORIGIN')).auth.signIn({ email: 'a@example.com', password: 'x' });

  assert.deepEqual(result, { ok: false, code: 'FORBIDDEN', message: 'Said INVALID_ORIGIN.' });
});

test('an answer that is no refusal of the library is BAD_RESPONSE', async () => {
  for (const answer of [
    { status: 502, body: '<html>Bad Gateway</html>' },
    { status: 400, body: '{"message":"no code here"}' },
    { status: 400, body: 'null' },
    refused(400, 'SOMETHING_NEW')
  ]) {
    const result = await setup(answer).auth.signIn({ email: 'a@example.com', password: 'x' });
    assert.equal(!result.ok && result.code, 'BAD_RESPONSE', answer.body);
  }
});

test('a server that cannot be reached is UNREACHABLE, and is not reported as a bug', async () => {
  const thrown = new TypeError('fetch failed');
  const { auth, reported } = setup(async () => {
    throw thrown;
  });

  const result = await auth.signOut();

  assert.deepEqual(result, {
    ok: false,
    code: 'UNREACHABLE',
    message: 'Could not reach the server: fetch failed',
    cause: thrown
  });
  assert.deepEqual(reported, []);
});

test('a body that breaks off half way is UNREACHABLE too', async () => {
  const { auth } = setup(async () => ({
    status: 200,
    text: async () => {
      throw new TypeError('terminated');
    }
  }));

  const result = await auth.signOut();

  assert.equal(!result.ok && result.code, 'UNREACHABLE');
});

test('anything else thrown on this side is UNEXPECTED, and is reported', async () => {
  const thrown = new Error('a bug');
  const { auth, reported } = setup(async () => {
    throw thrown;
  });

  const result = await auth.signOut();

  assert.equal(!result.ok && result.code, 'UNEXPECTED');
  assert.deepEqual(reported, [{ error: thrown, name: 'signOut' }]);
});

test('an input JSON cannot express is UNEXPECTED, not an unreachable server, and nothing is sent', async () => {
  const { auth, sent, reported } = setup({ status: 200, body: '{}' });

  const result = await auth.signIn({ email: 'a@example.com', password: 1n as unknown as string });

  assert.equal(!result.ok && result.code, 'UNEXPECTED');
  assert.equal(sent.length, 0);
  assert.equal(reported.length, 1);
});

test("the fetch is called on its own, not as the config's: a browser's fetch passed in as it is works", async () => {
  const browserFetch: ApiClientConfig['fetch'] = async function (this: unknown) {
    if (this !== undefined) throw new TypeError('Illegal invocation');
    return { status: 200, text: async () => '{}' };
  };
  const auth = createAuthClient({ baseUrl: 'https://api.example.com', fetch: browserFetch, reportError: () => {} });

  assert.deepEqual(await auth.signOut(), { ok: true });
});

test('an address that is not the address of a server is refused when the client is built', () => {
  assert.throws(
    () =>
      createAuthClient({
        baseUrl: 'localhost:11210',
        fetch: async () => ({ status: 200, text: async () => '' }),
        reportError: () => {}
      }),
    /API base URL "localhost:11210" is invalid/
  );
});
