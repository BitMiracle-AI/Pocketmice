import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from './app.ts';

const WEB_ORIGIN = 'http://localhost:11211';

/**
 * An app whose sign-in library is a stand-in: it records the requests it is handed and answers each with one fixed
 * response that sets a cookie.
 * This file tests the parts of the app that are not operations: the health check, the addresses of the sign-in
 * library and what browsers are told about other origins. The operations are tested in http/operation.test.ts
 */
function setup(slowdownMs?: number) {
  const received: Request[] = [];
  const app = createApp({
    slowdownMs,
    auth: {
      handler: async (request) => {
        received.push(request);
        return new Response('from the sign-in library', {
          status: 201,
          headers: { 'set-cookie': 'pocketmice.session_token=abc; HttpOnly' }
        });
      }
    },
    webOrigins: [WEB_ORIGIN],
    implementations: [],
    identifyCaller: async () => ({ user: null }),
    spaceMembership: async () => null,
    conversationAccess: async () => null,
    reportError: () => {}
  });
  return { app, received };
}

test('the health check answers 200 while the process answers requests', async () => {
  const response = await setup().app.request('/api/health');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('an open address of the sign-in library: the request is handed over as it is, the response returned as it is', async () => {
  const { app, received } = setup();

  const response = await app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { origin: WEB_ORIGIN, 'content-type': 'application/json', cookie: 'a=1' },
    body: '{"email":"ada@example.com","password":"correct horse"}'
  });

  const request = received.at(0);
  assert.ok(request, 'the sign-in library should have been handed the request');
  assert.equal(request.method, 'POST');
  assert.equal(new URL(request.url).pathname, '/api/auth/sign-in/email');
  assert.equal(request.headers.get('cookie'), 'a=1');
  assert.equal(await request.text(), '{"email":"ada@example.com","password":"correct horse"}');

  assert.equal(response.status, 201);
  assert.equal(await response.text(), 'from the sign-in library');
  assert.equal(response.headers.get('set-cookie'), 'pocketmice.session_token=abc; HttpOnly');
});

test('any other address under /api/auth is not mounted: it is answered like an address that does not exist', async () => {
  const { app, received } = setup();

  for (const [method, path] of [
    ['GET', '/api/auth/get-session'],
    ['POST', '/api/auth/change-password'],
    ['POST', '/api/auth/sign-in/social'],
    // An open address, with the wrong method
    ['GET', '/api/auth/sign-out']
  ] as const) {
    const response = await app.request(path, { method });

    assert.equal(response.status, 404, `${method} ${path}`);
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, 'UNKNOWN_OPERATION');
  }
  assert.equal(received.length, 0);
});

test('a web page on the list: the browser is told it may read the response and send the cookie along', async () => {
  const response = await setup().app.request('/api/auth/sign-out', { method: 'POST', headers: { origin: WEB_ORIGIN } });

  assert.equal(response.headers.get('access-control-allow-origin'), WEB_ORIGIN);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
});

test('a web page that is not on the list: nothing in the response lets it in, so the browser keeps the response from it', async () => {
  const response = await setup().app.request('/api/health', { headers: { origin: 'https://evil.example' } });

  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('a preflight from a web page on the list is let through with the headers it asks for, remembered for two hours', async () => {
  const { app, received } = setup();

  const response = await app.request('/api/auth/sign-in/email', {
    method: 'OPTIONS',
    headers: {
      origin: WEB_ORIGIN,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type,x-anything'
    }
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), WEB_ORIGIN);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(response.headers.get('access-control-allow-headers'), 'content-type,x-anything');
  assert.equal(response.headers.get('access-control-max-age'), '7200');
  // A preflight is answered here and never reaches the sign-in library
  assert.equal(received.length, 0);
});

test('with a delay set for debugging, a request waits that long before it is handled; the health check and a preflight do not', async () => {
  const { app, received } = setup(400);
  /** How long the request took, in milliseconds */
  const timed = async (path: string, init?: RequestInit) => {
    const from = performance.now();
    const response = await app.request(path, init);
    return { response, took: performance.now() - from };
  };

  const health = await timed('/api/health');
  assert.equal(health.response.status, 200);
  assert.ok(health.took < 300, `the health check took ${health.took} ms`);

  const preflight = await timed('/api/auth/sign-in/email', {
    method: 'OPTIONS',
    headers: { origin: WEB_ORIGIN, 'access-control-request-method': 'POST' }
  });
  assert.equal(preflight.response.status, 204);
  assert.ok(preflight.took < 300, `the preflight took ${preflight.took} ms`);

  const signIn = await timed('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { origin: WEB_ORIGIN },
    body: '{}'
  });
  assert.equal(signIn.response.status, 201);
  assert.equal(received.length, 1);
  // A timer may fire a few milliseconds early by the clock read here
  assert.ok(signIn.took >= 380, `the sign-in took ${signIn.took} ms`);

  const unknown = await timed('/api/noSuchOperation', { method: 'POST', body: '{}' });
  assert.ok(unknown.took >= 380, `an address that does not exist took ${unknown.took} ms`);
});

test('with no delay set, nothing waits', async () => {
  const { app } = setup();
  const from = performance.now();
  const response = await app.request('/api/auth/sign-in/email', { method: 'POST', body: '{}' });

  assert.equal(response.status, 201);
  assert.ok(performance.now() - from < 300, 'a request with no delay set should be answered at once');
});
