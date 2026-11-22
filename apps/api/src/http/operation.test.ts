import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiClient } from '@pocketmice/client/api';
import { id } from '@pocketmice/contract/id';
import { operation } from '@pocketmice/contract/operation';
import { z } from 'zod';
import { createApp } from '../app.ts';
import { ApiError, implement, MAX_INPUT_BYTES } from './operation.ts';

const WEB_ORIGIN = 'http://localhost:11211';
const N1 = '11111111-1111-4111-8111-111111111111';

// The operation the tests call: a write that lists one error code and has an input field with a default
const renameNote = operation({
  name: 'renameNote',
  kind: 'write',
  input: z.object({ noteId: id, title: z.string().min(1).max(50), notify: z.boolean().default(false) }),
  output: z.object({ note: z.object({ id: z.string(), title: z.string() }) }),
  errors: ['NOT_FOUND']
});

type Rename = Parameters<typeof implement<typeof renameNote>>[1];

/**
 * An app with renameNote mounted. rename is what its implementation does; left out, it renames as the input says.
 * What the implementation was given is collected in calls, what the server reported about itself in reported.
 */
function setup(rename?: Rename) {
  const calls: unknown[] = [];
  const reported: { error: unknown; where: string }[] = [];

  const app = createApp({
    webOrigins: [WEB_ORIGIN],
    implementations: [
      implement(renameNote, async (context) => {
        calls.push(context);
        return rename ? rename(context) : { note: { id: context.input.noteId, title: context.input.title } };
      })
    ],
    reportError: (error, where) => reported.push({ error, where })
  });

  /**
   * Calls an operation the way a web page does. A value in headers replaces the default header of that name; null
   * leaves the header out.
   */
  function post(name: string, body: unknown, headers: Record<string, string | null> = {}) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    const merged = new Headers({ origin: WEB_ORIGIN, 'content-type': 'application/json' });
    for (const [header, value] of Object.entries(headers)) {
      if (value === null) merged.delete(header);
      else merged.set(header, value);
    }
    return app.request(`/api/${name}`, { method: 'POST', headers: merged, body: text });
  }

  return { app, post, calls, reported };
}

/** The error code and the status of a failed response */
async function failure(response: Response) {
  const body = (await response.json()) as { error: { code: string; message: string } };
  return { status: response.status, code: body.error.code, message: body.error.message };
}

test('a request that fits the definition: the implementation gets the checked input, the caller gets the output', async () => {
  const { post, calls, reported } = setup();

  const response = await post('renameNote', { noteId: N1, title: 'Groceries' });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { note: { id: N1, title: 'Groceries' } });
  // The default in the definition is filled in
  assert.deepEqual(calls, [{ input: { noteId: N1, title: 'Groceries', notify: false } }]);
  assert.deepEqual(reported, []);
});

test('an input that does not fit the definition is INVALID_INPUT, naming the field; the implementation does not run', async () => {
  const { post, calls } = setup();

  for (const input of [
    { noteId: N1, title: '' },
    { noteId: N1 },
    { noteId: 'abc', title: 'Groceries' },
    // A uuid, but in uppercase: an id has one spelling
    { noteId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', title: 'Groceries' },
    { noteId: N1, title: 'Groceries', notify: 'yes' },
    null,
    []
  ]) {
    const failed = await failure(await post('renameNote', input));

    assert.equal(failed.status, 400, JSON.stringify(input));
    assert.equal(failed.code, 'INVALID_INPUT');
  }
  assert.match((await failure(await post('renameNote', { noteId: N1, title: '' }))).message, /^title: /);
  assert.deepEqual(calls, []);
});

test('a body that is not JSON, or not sent as JSON, is INVALID_INPUT', async () => {
  const { post, calls } = setup();

  const notJson = await failure(await post('renameNote', '{"noteId":'));
  assert.deepEqual([notJson.status, notJson.code], [400, 'INVALID_INPUT']);
  assert.match(notJson.message, /not valid JSON/);

  for (const contentType of ['text/plain', null]) {
    const failed = await failure(
      await post('renameNote', { noteId: N1, title: 'Groceries' }, { 'content-type': contentType })
    );
    assert.deepEqual([failed.status, failed.code], [400, 'INVALID_INPUT']);
    assert.match(failed.message, /content-type application\/json/);
  }
  assert.deepEqual(calls, []);
});

test('a body over the size limit is INPUT_TOO_LARGE, decided from the declared length', async () => {
  const { post, calls } = setup();

  const response = await post(
    'renameNote',
    { noteId: N1, title: 'Groceries' },
    { 'content-length': String(MAX_INPUT_BYTES + 1) }
  );

  assert.deepEqual(await failure(response), {
    status: 413,
    code: 'INPUT_TOO_LARGE',
    message: `The request body is larger than ${MAX_INPUT_BYTES} bytes.`
  });
  assert.deepEqual(calls, []);
});

test('a body sent in chunks declares no length and is not accepted', async () => {
  const { post, calls } = setup();

  const failed = await failure(
    await post('renameNote', { noteId: N1, title: 'Groceries' }, { 'transfer-encoding': 'chunked' })
  );

  assert.deepEqual([failed.status, failed.code], [400, 'INVALID_INPUT']);
  assert.match(failed.message, /content-length header, not in chunks/);
  assert.deepEqual(calls, []);
});

test('a request from a web page that is not on the list is FORBIDDEN; one with no origin is let in', async () => {
  const { post, calls } = setup();

  const other = await failure(
    await post('renameNote', { noteId: N1, title: 'Groceries' }, { origin: 'https://evil.example' })
  );
  assert.deepEqual([other.status, other.code], [403, 'FORBIDDEN']);
  assert.deepEqual(calls, []);

  // A caller that is not a browser sends no origin
  const none = await post('renameNote', { noteId: N1, title: 'Groceries' }, { origin: null });
  assert.equal(none.status, 200);
  assert.equal(calls.length, 1);
});

test('an implementation refuses with a code its definition lists, or a universal one: the caller gets that code', async () => {
  const listed = setup(async () => {
    throw new ApiError('NOT_FOUND', 'There is no such note.');
  });
  assert.deepEqual(await failure(await listed.post('renameNote', { noteId: N1, title: 'Groceries' })), {
    status: 404,
    code: 'NOT_FOUND',
    message: 'There is no such note.'
  });
  assert.deepEqual(listed.reported, []);

  const universal = setup(async () => {
    throw new ApiError('INVALID_INPUT', 'That title is taken by a rule the definition cannot express.');
  });
  const failed = await failure(await universal.post('renameNote', { noteId: N1, title: 'Groceries' }));
  assert.deepEqual([failed.status, failed.code], [400, 'INVALID_INPUT']);
});

test('the reason attached to a refusal goes to the log and not to the caller', async () => {
  const reason = new Error('the disk said no: /var/data/notes');
  const { post, reported } = setup(async () => {
    throw new ApiError('NOT_FOUND', 'There is no such note.', { cause: reason });
  });

  const response = await post('renameNote', { noteId: N1, title: 'Groceries' });
  const text = await response.text();

  assert.equal(response.status, 404);
  assert.doesNotMatch(text, /disk|var\/data/);
  assert.deepEqual(reported, [{ error: reason, where: 'renameNote' }]);
});

test('an implementation refuses with a code its definition does not list: INTERNAL, and it is reported', async () => {
  const { post, reported } = setup(async () => {
    throw new ApiError('CONFLICT', 'A note with that title exists.');
  });

  const failed = await failure(await post('renameNote', { noteId: N1, title: 'Groceries' }));

  assert.deepEqual(failed, { status: 500, code: 'INTERNAL', message: 'The server ran into an internal error.' });
  assert.equal(reported.length, 1);
  assert.equal(reported[0]?.where, 'renameNote');
  assert.match(String(reported[0]?.error), /threw error code CONFLICT, which its definition does not list/);
});

test('an implementation throws anything else: INTERNAL, the reason is reported and not told to the caller', async () => {
  const bug = new TypeError('cannot read properties of undefined (reading "rows")');
  const { post, reported } = setup(async () => {
    throw bug;
  });

  const response = await post('renameNote', { noteId: N1, title: 'Groceries' });
  const text = await response.text();

  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(text), {
    error: { code: 'INTERNAL', message: 'The server ran into an internal error.' }
  });
  assert.deepEqual(reported, [{ error: bug, where: 'renameNote' }]);
});

test('a field the definition does not have is dropped from the output before it is sent', async () => {
  const { post } = setup(async ({ input }) => {
    const row = { id: input.noteId, title: input.title, ownerEmail: 'ada@example.com' };
    return { note: row, internalCounter: 7 };
  });

  const response = await post('renameNote', { noteId: N1, title: 'Groceries' });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { note: { id: N1, title: 'Groceries' } });
});

test('an output that does not match the definition is INTERNAL and reported, never sent', async () => {
  const { post, reported } = setup(async () => ({ note: { id: N1 } }) as never);

  const failed = await failure(await post('renameNote', { noteId: N1, title: 'Groceries' }));

  assert.deepEqual([failed.status, failed.code], [500, 'INTERNAL']);
  assert.match(String(reported[0]?.error), /returned a value that does not match its definition: note\.title: /);
});

test('an address with nothing at it answers UNKNOWN_OPERATION with the same error body', async () => {
  const { app, post } = setup();

  const missing = await failure(await post('getNothing', {}));
  assert.deepEqual(missing, {
    status: 404,
    code: 'UNKNOWN_OPERATION',
    message: 'There is no endpoint at POST /api/getNothing.'
  });

  // An operation is a POST only
  const wrongMethod = await failure(await app.request('/api/renameNote'));
  assert.deepEqual([wrongMethod.status, wrongMethod.code], [404, 'UNKNOWN_OPERATION']);
});

test('the same operation implemented twice is an error when the app is built', () => {
  const twice = implement(renameNote, async ({ input }) => ({ note: { id: input.noteId, title: input.title } }));

  assert.throws(
    () => createApp({ webOrigins: [WEB_ORIGIN], implementations: [twice, twice], reportError: () => {} }),
    /Operation renameNote is implemented more than once/
  );
});

test('the client and the api agree: a call through the real client gets the output, or the code the api refused with', async () => {
  const { app } = setup(async ({ input }) => {
    if (input.title === 'Missing') throw new ApiError('NOT_FOUND', 'There is no such note.');
    return { note: { id: input.noteId, title: input.title } };
  });
  const call = createApiClient({
    baseUrl: 'http://api.test',
    fetch: async (url, init) => app.request(url, init),
    reportError: (error) => assert.fail(`the client reported ${String(error)}`)
  });

  assert.deepEqual(await call(renameNote, { noteId: N1, title: 'Groceries' }), {
    ok: true,
    data: { note: { id: N1, title: 'Groceries' } }
  });
  assert.deepEqual(await call(renameNote, { noteId: N1, title: 'Missing' }), {
    ok: false,
    code: 'NOT_FOUND',
    message: 'There is no such note.'
  });
  assert.deepEqual(
    await call(renameNote, { noteId: N1, title: '' }).then((result) => !result.ok && result.code),
    'INVALID_INPUT'
  );
});
