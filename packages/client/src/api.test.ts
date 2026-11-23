import assert from 'node:assert/strict';
import { test } from 'node:test';
import { id } from '@pocketmice/contract/id';
import { operation } from '@pocketmice/contract/operation';
import { z } from 'zod';
import { type ApiClientConfig, createApiClient } from './api.ts';

const getNote = operation({
  name: 'getNote',
  description: 'An operation of the tests.',
  kind: 'read',
  access: 'public',
  belongsTo: 'none',
  input: z.object({ noteId: id }),
  output: z.object({ title: z.string() }),
  errors: ['NOT_FOUND']
});

const NOTE = '11111111-1111-4111-8111-111111111111';

type Sent = Parameters<ApiClientConfig['fetch']>;

/**
 * A client whose fetch is a stand-in: it records what was sent and answers with `answer`, or does what `fetch`
 * does. Errors this side reports are collected in `reported`.
 */
function setup(answer: { status: number; body: string } | ApiClientConfig['fetch']) {
  const sent: Sent[] = [];
  const reported: { error: unknown; name: string }[] = [];
  const call = createApiClient({
    baseUrl: 'https://api.example.com',
    fetch: async (...args) => {
      sent.push(args);
      if (typeof answer === 'function') return answer(...args);
      return { status: answer.status, text: async () => answer.body };
    },
    reportError: (error, name) => reported.push({ error, name })
  });
  return { call, sent, reported };
}

test('a call is a POST of the input as JSON to the address of the operation', async () => {
  const { call, sent } = setup({ status: 200, body: '{"title":"Groceries"}' });

  const result = await call(getNote, { noteId: NOTE });

  assert.deepEqual(result, { ok: true, data: { title: 'Groceries' } });
  assert.deepEqual(sent, [
    [
      'https://api.example.com/api/getNote',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: `{"noteId":"${NOTE}"}` }
    ]
  ]);
});

test("the fetch is called on its own, not as the config's: a browser's fetch passed in as it is works", async () => {
  // What a browser's fetch does when it is called as a method of anything but the window
  const browserFetch: ApiClientConfig['fetch'] = async function (this: unknown) {
    if (this !== undefined) throw new TypeError('Illegal invocation');
    return { status: 200, text: async () => '{"title":"Groceries"}' };
  };
  const call = createApiClient({ baseUrl: 'https://api.example.com', fetch: browserFetch, reportError: () => {} });

  assert.deepEqual(await call(getNote, { noteId: NOTE }), { ok: true, data: { title: 'Groceries' } });
});

test('a field the server added later, unknown to this side, comes through', async () => {
  const { call } = setup({ status: 200, body: '{"title":"Groceries","pinned":true}' });

  const result = await call(getNote, { noteId: NOTE });

  assert.deepEqual(result, { ok: true, data: { title: 'Groceries', pinned: true } });
});

test('an error code the operation lists, and one any operation may answer with, come back as they are', async () => {
  const notFound = setup({ status: 404, body: '{"error":{"code":"NOT_FOUND","message":"There is no such note."}}' });
  assert.deepEqual(await notFound.call(getNote, { noteId: NOTE }), {
    ok: false,
    code: 'NOT_FOUND',
    message: 'There is no such note.'
  });

  const internal = setup({ status: 500, body: '{"error":{"code":"INTERNAL","message":"The server failed."}}' });
  assert.deepEqual(await internal.call(getNote, { noteId: NOTE }), {
    ok: false,
    code: 'INTERNAL',
    message: 'The server failed.'
  });
});

test('an error code this side does not know is BAD_RESPONSE, not passed off as a known one', async () => {
  // CONFLICT exists, but getNote does not list it; BRAND_NEW is a code a newer server invented
  for (const code of ['CONFLICT', 'BRAND_NEW']) {
    const { call } = setup({ status: 409, body: `{"error":{"code":"${code}","message":"Later."}}` });

    const result = await call(getNote, { noteId: NOTE });

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, 'BAD_RESPONSE');
    assert.match((!result.ok && result.message) || '', new RegExp(`does not know: ${code}\\. Later\\.`));
  }
});

test('a failure with no error body, like the 502 page of a proxy, is BAD_RESPONSE', async () => {
  const { call } = setup({ status: 502, body: '<html>Bad Gateway</html>' });

  assert.deepEqual(await call(getNote, { noteId: NOTE }), {
    ok: false,
    code: 'BAD_RESPONSE',
    message: 'The server answered getNote with status 502 and no error code.'
  });
});

test('a success whose body is not a JSON object is BAD_RESPONSE', async () => {
  for (const body of ['', 'OK', '[1,2]', 'null', '"text"']) {
    const { call } = setup({ status: 200, body });

    const result = await call(getNote, { noteId: NOTE });

    assert.equal(!result.ok && result.code, 'BAD_RESPONSE', `body ${JSON.stringify(body)}`);
  }
});

test('fetch cannot connect, or the body breaks off: UNREACHABLE, and nothing is reported as a bug', async () => {
  const refused = setup(async () => {
    throw new TypeError('fetch failed');
  });
  assert.deepEqual(await refused.call(getNote, { noteId: NOTE }), {
    ok: false,
    code: 'UNREACHABLE',
    message: 'Could not reach the server: fetch failed'
  });
  assert.deepEqual(refused.reported, []);

  const cutOff = setup(async () => ({
    status: 200,
    text: async () => {
      throw new TypeError('terminated');
    }
  }));
  const result = await cutOff.call(getNote, { noteId: NOTE });
  assert.equal(!result.ok && result.code, 'UNREACHABLE');
});

test('any other error while sending is a bug on this side: UNEXPECTED, and it is reported', async () => {
  const bug = new RangeError('a bug in the fetch wrapper');
  const { call, reported } = setup(async () => {
    throw bug;
  });

  assert.deepEqual(await call(getNote, { noteId: NOTE }), {
    ok: false,
    code: 'UNEXPECTED',
    message: 'Calling getNote failed before a response arrived.'
  });
  assert.deepEqual(reported, [{ error: bug, name: 'getNote' }]);
});

test('an input JSON cannot express is UNEXPECTED, not UNREACHABLE, and nothing is sent', async () => {
  const { call, sent, reported } = setup({ status: 200, body: '{}' });
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  const result = await call(getNote, circular as unknown as { noteId: string });

  assert.equal(!result.ok && result.code, 'UNEXPECTED');
  assert.equal(sent.length, 0);
  assert.equal(reported.length, 1);
});

test('a base URL that is not an address fails when the client is built', () => {
  const config = { fetch: async () => ({ status: 200, text: async () => '{}' }), reportError: () => {} };

  assert.throws(() => createApiClient({ ...config, baseUrl: 'api.example.com' }), /API base URL .* is invalid/);
  assert.throws(() => createApiClient({ ...config, baseUrl: '' }), /API base URL .* is invalid/);
});
