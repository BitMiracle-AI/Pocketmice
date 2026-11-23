import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiClient } from '@pocketmice/client/api';
import { id } from '@pocketmice/contract/id';
import { operation } from '@pocketmice/contract/operation';
import { z } from 'zod';
import { createApp } from '../app.ts';
import {
  ApiError,
  type ConversationAccess,
  type CurrentUser,
  implement,
  MAX_INPUT_BYTES,
  type Membership
} from './operation.ts';

const WEB_ORIGIN = 'http://localhost:11211';
const ADA: CurrentUser = { id: 'u1', email: 'ada@example.com' };
const OWNER: Membership = { role: 'owner' };
/** The id of the API key a request came with, in the tests that send one */
const KEY = 'k1';
// The ids the tests use. An id in an input is a lowercase uuid
const S1 = '11111111-1111-4111-8111-111111111111';
const N1 = '22222222-2222-4222-8222-222222222222';
const C1 = '33333333-3333-4333-8333-333333333333';

// The operations the tests call: a write of a space that takes an editor, a read that belongs to no space, one
// anyone may call, one kept for the person themselves, and two of a conversation: a read open to whoever can read
// it, and a write open to its members
const renameNote = operation({
  name: 'renameNote',
  description: 'An operation of the tests.',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'editor',
  input: z.object({ spaceId: id, noteId: id, title: z.string().min(1).max(50), notify: z.boolean().default(false) }),
  output: z.object({ note: z.object({ id: z.string(), title: z.string() }) }),
  errors: ['NOT_FOUND']
});

const getSettings = operation({
  name: 'getSettings',
  description: 'An operation of the tests.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'none',
  input: z.object({}),
  output: z.object({ theme: z.string() }),
  errors: []
});

const getInvitation = operation({
  name: 'getInvitation',
  description: 'An operation of the tests.',
  kind: 'read',
  access: 'public',
  belongsTo: 'none',
  input: z.object({ invitationId: id }),
  output: z.object({ spaceName: z.string() }),
  errors: []
});

const createToken = operation({
  name: 'createToken',
  description: 'An operation of the tests.',
  kind: 'write',
  access: 'session',
  belongsTo: 'none',
  input: z.object({}),
  output: z.object({ token: z.string() }),
  errors: []
});

const getThread = operation({
  name: 'getThread',
  description: 'An operation of the tests.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'conversation',
  minRole: 'viewer',
  openTo: 'reader',
  input: z.object({ spaceId: id, conversationId: id }),
  output: z.object({ title: z.string() }),
  errors: []
});

const createReply = operation({
  name: 'createReply',
  description: 'An operation of the tests.',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'conversation',
  minRole: 'viewer',
  openTo: 'member',
  input: z.object({ spaceId: id, conversationId: id, text: z.string() }),
  output: z.object({}),
  errors: []
});

interface Options {
  /** Who is calling. Left out, it is ADA; null is nobody */
  user?: CurrentUser | null;
  /** The API key the request came with. Left out, the person signed in themselves */
  apiKey?: { id: string; permission: 'read' | 'write' };
  /** Response headers that whoever identified the caller wants sent along. Left out, there are none */
  responseHeaders?: Headers;
  /** What the caller is in the space the input names. Left out, the owner; null means the space does not exist for them */
  membership?: Membership | null;
  /**
   * What the caller is to the conversation the input names. Left out, a member of it; null means the space has no
   * such conversation
   */
  conversation?: ConversationAccess | null;
  /** What the implementation of renameNote does. Left out, it renames as the input says */
  rename?: Parameters<typeof implement<typeof renameNote>>[1];
}

/**
 * An app with the four operations mounted. Telling who is calling and the membership lookup are stand-ins. What the
 * implementations were given is collected in calls, the lookups in identified and membershipLookups, and what the
 * server reported about itself in reported.
 */
function setup({
  user = ADA,
  apiKey,
  responseHeaders,
  membership = OWNER,
  conversation = { member: true },
  rename
}: Options = {}) {
  const calls: unknown[] = [];
  const reported: { error: unknown; where: string }[] = [];
  let identified = 0;
  const membershipLookups: unknown[] = [];
  const conversationLookups: unknown[] = [];

  const app = createApp({
    auth: { handler: async () => new Response('from the sign-in library') },
    webOrigins: [WEB_ORIGIN],
    implementations: [
      implement(renameNote, async (context) => {
        calls.push(context);
        return rename ? rename(context) : { note: { id: context.input.noteId, title: context.input.title } };
      }),
      implement(getSettings, async (context) => {
        calls.push(context);
        return { theme: 'dark' };
      }),
      implement(getInvitation, async (context) => {
        calls.push(context);
        return { spaceName: 'Research' };
      }),
      implement(createToken, async (context) => {
        calls.push(context);
        return { token: 'abc' };
      }),
      implement(getThread, async (context) => {
        calls.push(context);
        return { title: 'Launch' };
      }),
      implement(createReply, async (context) => {
        calls.push(context);
        return {};
      })
    ],
    identifyCaller: async () => {
      identified += 1;
      return { user, apiKey, responseHeaders };
    },
    spaceMembership: async (spaceId, userId) => {
      membershipLookups.push({ spaceId, userId });
      return membership;
    },
    conversationAccess: async (spaceId, conversationId, userId) => {
      conversationLookups.push({ spaceId, conversationId, userId });
      return conversation;
    },
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

  return { app, post, calls, reported, membershipLookups, conversationLookups, identifiedTimes: () => identified };
}

/** A renameNote input that fits the definition */
const RENAME = { spaceId: S1, noteId: N1, title: 'Groceries' };

/** The error code and the status of a failed response */
async function failure(response: Response) {
  const body = (await response.json()) as { error: { code: string; message: string } };
  return { status: response.status, code: body.error.code, message: body.error.message };
}

test('a request that fits the definition: the implementation gets the checked input and who is calling, the caller gets the output', async () => {
  const { post, calls, reported, membershipLookups } = setup();

  const response = await post('renameNote', RENAME);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { note: { id: N1, title: 'Groceries' } });
  // The default in the definition is filled in
  assert.deepEqual(calls, [
    { input: { ...RENAME, notify: false }, clientIp: null, user: ADA, apiKeyId: null, membership: OWNER }
  ]);
  assert.deepEqual(membershipLookups, [{ spaceId: S1, userId: 'u1' }]);
  assert.deepEqual(reported, []);
});

test('an operation that is not public, called by nobody, is UNAUTHENTICATED; the implementation does not run', async () => {
  const { post, calls, membershipLookups } = setup({ user: null });

  for (const [name, input] of [
    ['getSettings', {}],
    ['renameNote', RENAME]
  ] as const) {
    assert.deepEqual(await failure(await post(name, input)), {
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Sign in, or send a valid API key, to do this.'
    });
  }
  // An operation kept for the person themselves does not suggest an API key
  assert.deepEqual(await failure(await post('createToken', {})), {
    status: 401,
    code: 'UNAUTHENTICATED',
    message: 'Sign in to do this.'
  });
  assert.deepEqual(calls, []);
  // Without knowing who is calling there is nobody to look up
  assert.deepEqual(membershipLookups, []);
});

test('a request that came with an API key is the person whose key it is: the implementation is given the same as when they sign in, and which key it was, to record', async () => {
  const { post, calls } = setup({ apiKey: { id: KEY, permission: 'write' } });

  assert.equal((await post('renameNote', RENAME)).status, 200);
  assert.equal((await post('getSettings', {})).status, 200);

  assert.deepEqual(calls, [
    { input: { ...RENAME, notify: false }, clientIp: null, user: ADA, apiKeyId: KEY, membership: OWNER },
    { input: {}, clientIp: null, user: ADA, apiKeyId: KEY }
  ]);
});

test('a read-only API key calls reads, and is FORBIDDEN to call a write whatever the person may do themselves', async () => {
  // The person is the owner of the space: the key still does not write
  const { post, calls, membershipLookups } = setup({ apiKey: { id: KEY, permission: 'read' } });

  assert.equal((await post('getSettings', {})).status, 200);
  assert.deepEqual(await failure(await post('renameNote', RENAME)), {
    status: 403,
    code: 'FORBIDDEN',
    message: 'This API key is read-only, and this request changes something.'
  });

  assert.deepEqual(calls, [{ input: {}, clientIp: null, user: ADA, apiKeyId: KEY }]);
  // Refused before the body was read or anyone was looked up
  assert.deepEqual(membershipLookups, []);
  const unread = await failure(await post('renameNote', '{"spaceId":'));
  assert.deepEqual([unread.status, unread.code], [403, 'FORBIDDEN']);
});

test('an operation kept for the person themselves is FORBIDDEN to any API key, and open to the person signed in', async () => {
  for (const permission of ['read', 'write'] as const) {
    const { post, calls } = setup({ apiKey: { id: KEY, permission } });

    assert.deepEqual(await failure(await post('createToken', {})), {
      status: 403,
      code: 'FORBIDDEN',
      message: 'This cannot be done with an API key: sign in to do it.'
    });
    assert.deepEqual(calls, []);
  }

  const { post, calls } = setup();
  assert.deepEqual(await (await post('createToken', {})).json(), { token: 'abc' });
  assert.deepEqual(calls, [{ input: {}, clientIp: null, user: ADA, apiKeyId: null }]);
});

test('a member whose role is lower than the operation takes is FORBIDDEN; the implementation does not run', async () => {
  const viewer = setup({ membership: { role: 'viewer' } });

  assert.deepEqual(await failure(await viewer.post('renameNote', RENAME)), {
    status: 403,
    code: 'FORBIDDEN',
    message: 'This takes the role editor in the space, and yours is viewer.'
  });
  assert.deepEqual(viewer.calls, []);

  // The role it takes, and any role above it, is let in
  for (const role of ['editor', 'owner'] as const) {
    const { post, calls } = setup({ membership: { role } });

    assert.equal((await post('renameNote', RENAME)).status, 200, role);
    assert.deepEqual(calls, [
      { input: { ...RENAME, notify: false }, clientIp: null, user: ADA, apiKeyId: null, membership: { role } }
    ]);
  }
});

test('an operation that belongs to no space gets the caller and no membership; nobody is looked up', async () => {
  const { post, calls, membershipLookups } = setup();

  const response = await post('getSettings', {});

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ input: {}, clientIp: null, user: ADA, apiKeyId: null }]);
  assert.deepEqual(membershipLookups, []);
});

test('an operation anyone may call does not ask who is calling', async () => {
  const { post, calls, identifiedTimes } = setup({ user: null });

  const response = await post('getInvitation', { invitationId: N1 });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ input: { invitationId: N1 }, clientIp: null }]);
  assert.equal(identifiedTimes(), 0);
});

test('the implementation is told the IP the request came from, as the reverse proxy reports it; one that cannot be told is null', async () => {
  const { post, calls } = setup({ user: null });
  const from = (forwarded: string | null) =>
    post('getInvitation', { invitationId: N1 }, { 'x-forwarded-for': forwarded });

  for (const forwarded of ['203.0.113.7', ' 2001:db8::1 ']) await from(forwarded);
  // No header; a list, of which any part may be what the client made up; and what is not an IP
  for (const forwarded of [null, '198.51.100.1, 203.0.113.7', 'unknown']) await from(forwarded);

  assert.deepEqual(
    calls.map((call) => (call as { clientIp: unknown }).clientIp),
    ['203.0.113.7', '2001:db8::1', null, null, null]
  );
});

test('a space that does not exist for the caller is UNKNOWN_SPACE; the implementation does not run', async () => {
  const { post, calls } = setup({ membership: null });

  assert.deepEqual(await failure(await post('renameNote', RENAME)), {
    status: 404,
    code: 'UNKNOWN_SPACE',
    message: `There is no space ${S1}, or you are not a member of it.`
  });
  assert.deepEqual(calls, []);
});

/** An input of the two operations of a conversation */
const THREAD = { spaceId: S1, conversationId: C1 };

test('an operation of a conversation runs for a member of it, and is given what an operation of a space is given', async () => {
  const { post, calls, membershipLookups, conversationLookups } = setup({ membership: { role: 'viewer' } });

  assert.equal((await post('getThread', THREAD)).status, 200);
  assert.equal((await post('createReply', { ...THREAD, text: 'Done.' })).status, 200);

  const given = { clientIp: null, user: ADA, apiKeyId: null, membership: { role: 'viewer' } };
  assert.deepEqual(calls, [
    { input: THREAD, ...given },
    { input: { ...THREAD, text: 'Done.' }, ...given }
  ]);
  // The space is asked about first, then the conversation of that space, once each for every call
  assert.deepEqual(membershipLookups, [
    { spaceId: S1, userId: ADA.id },
    { spaceId: S1, userId: ADA.id }
  ]);
  assert.deepEqual(conversationLookups, [
    { spaceId: S1, conversationId: C1, userId: ADA.id },
    { spaceId: S1, conversationId: C1, userId: ADA.id }
  ]);
});

test('a conversation that does not exist for the caller is UNKNOWN_CONVERSATION, whether the space has none or the caller is not in it; the implementation does not run', async () => {
  const expected = {
    status: 404,
    code: 'UNKNOWN_CONVERSATION',
    message: `Space ${S1} has no conversation ${C1}, or you are not a member of it.`
  };

  for (const conversation of [null, { member: false }]) {
    const { post, calls } = setup({ membership: { role: 'editor' }, conversation });

    assert.deepEqual(await failure(await post('getThread', THREAD)), expected);
    assert.deepEqual(await failure(await post('createReply', { ...THREAD, text: 'Done.' })), expected);
    assert.deepEqual(calls, []);
  }

  // Not even the owner of the space is told of a conversation the space does not have
  const owner = setup({ membership: OWNER, conversation: null });
  assert.deepEqual(await failure(await owner.post('getThread', THREAD)), expected);
});

test('the owner of the space reads a conversation without being in it, and is FORBIDDEN what is open to its members', async () => {
  const { post, calls } = setup({ membership: OWNER, conversation: { member: false } });

  assert.equal((await post('getThread', THREAD)).status, 200);
  assert.deepEqual(await failure(await post('createReply', { ...THREAD, text: 'Done.' })), {
    status: 403,
    code: 'FORBIDDEN',
    message:
      'This takes being a member of the conversation. As the owner of the space you can read it; to do this, add yourself to it first.'
  });
  assert.deepEqual(calls, [{ input: THREAD, clientIp: null, user: ADA, apiKeyId: null, membership: OWNER }]);
});

test('whoever is not in the space is not asked about its conversations: UNKNOWN_SPACE, and the conversation is not looked up', async () => {
  const { post, calls, conversationLookups } = setup({ membership: null });

  assert.equal((await failure(await post('getThread', THREAD))).code, 'UNKNOWN_SPACE');
  assert.deepEqual(conversationLookups, []);
  assert.deepEqual(calls, []);
});

test('the headers whoever identified the caller wants sent are on the response, whether it succeeds or fails', async () => {
  const responseHeaders = new Headers();
  responseHeaders.append('set-cookie', 'pocketmice.session_token=renewed; HttpOnly');
  responseHeaders.append('set-cookie', 'pocketmice.other=1');

  const succeeded = await setup({ responseHeaders }).post('getSettings', {});
  assert.equal(succeeded.status, 200);
  assert.deepEqual(succeeded.headers.getSetCookie(), [
    'pocketmice.session_token=renewed; HttpOnly',
    'pocketmice.other=1'
  ]);

  // The session has ended: the order to delete the cookie goes out with the refusal
  const expired = new Headers({ 'set-cookie': 'pocketmice.session_token=; Max-Age=0' });
  const refused = await setup({ user: null, responseHeaders: expired }).post('getSettings', {});
  assert.equal(refused.status, 401);
  assert.deepEqual(refused.headers.getSetCookie(), ['pocketmice.session_token=; Max-Age=0']);

  const invalid = await setup({ responseHeaders }).post('renameNote', { ...RENAME, title: '' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.getSetCookie().length, 2);
});

test('an input that does not fit the definition is INVALID_INPUT, naming the field; the implementation does not run', async () => {
  const { post, calls, membershipLookups } = setup();

  for (const input of [
    { ...RENAME, title: '' },
    { spaceId: S1, noteId: N1 },
    { ...RENAME, noteId: 'abc' },
    // A uuid, but in uppercase: an id has one spelling
    { ...RENAME, spaceId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' },
    { ...RENAME, notify: 'yes' },
    // A field the definition does not have, here notify misspelt. Passed over, the note would be renamed without
    // the notice that was asked for, and the caller told that all went well
    { ...RENAME, notfy: true },
    null,
    []
  ]) {
    const failed = await failure(await post('renameNote', input));

    assert.equal(failed.status, 400, JSON.stringify(input));
    assert.equal(failed.code, 'INVALID_INPUT');
  }
  assert.match((await failure(await post('renameNote', { ...RENAME, title: '' }))).message, /^title: /);
  assert.match((await failure(await post('renameNote', { ...RENAME, notfy: true }))).message, /"notfy"/);
  // An operation that takes nothing is not sent anything
  assert.equal((await failure(await post('getSettings', { theme: 'dark' }))).code, 'INVALID_INPUT');
  assert.deepEqual(calls, []);
  // An input that does not fit names no space to look anyone up in
  assert.deepEqual(membershipLookups, []);
});

test('a body that is not JSON, or not sent as JSON, is INVALID_INPUT', async () => {
  const { post, calls } = setup();

  const notJson = await failure(await post('renameNote', '{"noteId":'));
  assert.deepEqual([notJson.status, notJson.code], [400, 'INVALID_INPUT']);
  assert.match(notJson.message, /not valid JSON/);

  for (const contentType of ['text/plain', null]) {
    const failed = await failure(await post('renameNote', RENAME, { 'content-type': contentType }));
    assert.deepEqual([failed.status, failed.code], [400, 'INVALID_INPUT']);
    assert.match(failed.message, /content-type application\/json/);
  }
  assert.deepEqual(calls, []);
});

test('a body over the size limit is INPUT_TOO_LARGE, decided from the declared length before anyone is identified', async () => {
  const { post, calls, identifiedTimes } = setup();

  const response = await post('renameNote', RENAME, { 'content-length': String(MAX_INPUT_BYTES + 1) });

  assert.deepEqual(await failure(response), {
    status: 413,
    code: 'INPUT_TOO_LARGE',
    message: `The request body is larger than ${MAX_INPUT_BYTES} bytes.`
  });
  assert.deepEqual(calls, []);
  assert.equal(identifiedTimes(), 0);
});

test('a body sent in chunks declares no length and is not accepted', async () => {
  const { post, calls } = setup();

  const failed = await failure(await post('renameNote', RENAME, { 'transfer-encoding': 'chunked' }));

  assert.deepEqual([failed.status, failed.code], [400, 'INVALID_INPUT']);
  assert.match(failed.message, /content-length header, not in chunks/);
  assert.deepEqual(calls, []);
});

test('a request from a web page that is not on the list is FORBIDDEN, signed in or not; one with no origin is let in', async () => {
  const { post, calls, identifiedTimes } = setup();

  const other = await failure(await post('renameNote', RENAME, { origin: 'https://evil.example' }));
  assert.deepEqual([other.status, other.code], [403, 'FORBIDDEN']);
  assert.deepEqual(calls, []);
  assert.equal(identifiedTimes(), 0);

  // A caller that is not a browser sends no origin
  const none = await post('renameNote', RENAME, { origin: null });
  assert.equal(none.status, 200);
  assert.equal(calls.length, 1);
});

test('an implementation refuses with a code its definition lists, or a universal one: the caller gets that code', async () => {
  const listed = setup({
    rename: async () => {
      throw new ApiError('NOT_FOUND', 'There is no such note.');
    }
  });
  assert.deepEqual(await failure(await listed.post('renameNote', RENAME)), {
    status: 404,
    code: 'NOT_FOUND',
    message: 'There is no such note.'
  });
  assert.deepEqual(listed.reported, []);

  const universal = setup({
    rename: async () => {
      throw new ApiError('FORBIDDEN', 'Only the owner of the space renames its notes.');
    }
  });
  const failed = await failure(await universal.post('renameNote', RENAME));
  assert.deepEqual([failed.status, failed.code], [403, 'FORBIDDEN']);
});

test('the reason attached to a refusal goes to the log and not to the caller', async () => {
  const reason = new Error('the disk said no: /var/data/notes');
  const { post, reported } = setup({
    rename: async () => {
      throw new ApiError('NOT_FOUND', 'There is no such note.', { cause: reason });
    }
  });

  const response = await post('renameNote', RENAME);
  const text = await response.text();

  assert.equal(response.status, 404);
  assert.doesNotMatch(text, /disk|var\/data/);
  assert.deepEqual(reported, [{ error: reason, where: 'renameNote' }]);
});

test('an implementation refuses with a code its definition does not list: INTERNAL, and it is reported', async () => {
  const { post, reported } = setup({
    rename: async () => {
      throw new ApiError('CONFLICT', 'A note with that title exists.');
    }
  });

  const failed = await failure(await post('renameNote', RENAME));

  assert.deepEqual(failed, { status: 500, code: 'INTERNAL', message: 'The server ran into an internal error.' });
  assert.equal(reported.length, 1);
  assert.equal(reported[0]?.where, 'renameNote');
  assert.match(String(reported[0]?.error), /threw error code CONFLICT, which its definition does not list/);
});

test('an implementation throws anything else: INTERNAL, the reason is reported and not told to the caller', async () => {
  const bug = new TypeError('cannot read properties of undefined (reading "rows")');
  const { post, reported } = setup({
    rename: async () => {
      throw bug;
    }
  });

  const response = await post('renameNote', RENAME);
  const text = await response.text();

  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(text), {
    error: { code: 'INTERNAL', message: 'The server ran into an internal error.' }
  });
  assert.deepEqual(reported, [{ error: bug, where: 'renameNote' }]);
});

test('a field the definition does not have is dropped from the output before it is sent', async () => {
  const { post } = setup({
    rename: async ({ input }) => {
      const row = { id: input.noteId, title: input.title, ownerEmail: 'ada@example.com' };
      return { note: row, internalCounter: 7 };
    }
  });

  const response = await post('renameNote', RENAME);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { note: { id: N1, title: 'Groceries' } });
});

test('an output that does not match the definition is INTERNAL and reported, never sent', async () => {
  const { post, reported } = setup({ rename: async () => ({ note: { id: N1 } }) as never });

  const failed = await failure(await post('renameNote', RENAME));

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
  const twice = implement(getSettings, async () => ({ theme: 'dark' }));

  assert.throws(
    () =>
      createApp({
        auth: { handler: async () => new Response(null) },
        webOrigins: [WEB_ORIGIN],
        implementations: [twice, twice],
        identifyCaller: async () => ({ user: null }),
        spaceMembership: async () => null,
        conversationAccess: async () => null,
        reportError: () => {}
      }),
    /Operation getSettings is implemented more than once/
  );
});

test('the client and the api agree: a call through the real client gets the output, or the code the api refused with', async () => {
  const { app } = setup({
    rename: async ({ input }) => {
      if (input.title === 'Missing') throw new ApiError('NOT_FOUND', 'There is no such note.');
      return { note: { id: input.noteId, title: input.title } };
    }
  });
  const call = createApiClient({
    baseUrl: 'http://api.test',
    fetch: async (url, init) => app.request(url, init),
    reportError: (error) => assert.fail(`the client reported ${String(error)}`)
  });

  assert.deepEqual(await call(renameNote, RENAME), { ok: true, data: { note: { id: N1, title: 'Groceries' } } });
  assert.deepEqual(await call(renameNote, { ...RENAME, title: 'Missing' }), {
    ok: false,
    code: 'NOT_FOUND',
    message: 'There is no such note.'
  });
  assert.deepEqual(
    await call(renameNote, { ...RENAME, title: '' }).then((result) => !result.ok && result.code),
    'INVALID_INPUT'
  );
});
