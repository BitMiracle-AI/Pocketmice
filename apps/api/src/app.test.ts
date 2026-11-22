import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from './app.ts';

const WEB_ORIGIN = 'http://localhost:11211';

// This file tests the parts of the app that are not operations: the health check and what browsers are told about
// other origins. The operations are tested in http/operation.test.ts
const app = createApp({ webOrigins: [WEB_ORIGIN], implementations: [], reportError: () => {} });

test('the health check answers 200 while the process answers requests', async () => {
  const response = await app.request('/api/health');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('a web page on the list: the browser is told it may read the response', async () => {
  const response = await app.request('/api/health', { headers: { origin: WEB_ORIGIN } });

  assert.equal(response.headers.get('access-control-allow-origin'), WEB_ORIGIN);
});

test('a web page that is not on the list: nothing in the response lets it in, so the browser keeps the response from it', async () => {
  const response = await app.request('/api/health', { headers: { origin: 'https://evil.example' } });

  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('a preflight from a web page on the list is let through with the headers it asks for, remembered for two hours', async () => {
  const response = await app.request('/api/getServerInfo', {
    method: 'OPTIONS',
    headers: {
      origin: WEB_ORIGIN,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type,x-anything'
    }
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), WEB_ORIGIN);
  assert.equal(response.headers.get('access-control-allow-headers'), 'content-type,x-anything');
  assert.equal(response.headers.get('access-control-max-age'), '7200');
});
