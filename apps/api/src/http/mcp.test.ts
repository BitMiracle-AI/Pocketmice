import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bearerToken } from '@pocketmice/contract/domains/apiKey';
import { id } from '@pocketmice/contract/id';
import { operation } from '@pocketmice/contract/operation';
import { z } from 'zod';
import { createApp } from '../app.ts';
import { answer, MAX_MCP_INPUT_BYTES, MCP_PATH, type Tool, tool } from './mcp.ts';
import { callTool, connectMcp, type McpEra } from './mcpClient.testing.ts';
import { ApiError, type CurrentUser, implement, type Membership } from './operation.ts';

const WEB_ORIGIN = 'http://localhost:11211';
const ADA: CurrentUser = { id: 'u1', email: 'ada@example.com' };
const S1 = '11111111-1111-4111-8111-111111111111';
const N1 = '22222222-2222-4222-8222-222222222222';

/** The API keys of the tests: Ada's read-write key and her read-only one. Any other key does not work */
const WRITE_KEY = 'pm_write';
const READ_KEY = 'pm_read';
const KEYS: Record<string, { id: string; permission: 'read' | 'write' }> = {
  [WRITE_KEY]: { id: 'k-write', permission: 'write' },
  [READ_KEY]: { id: 'k-read', permission: 'read' }
};

const ERAS: McpEra[] = ['modern', 'legacy'];

// The operations of the tests: a write of a space, a read that belongs to no space, one anyone may call, and one
// kept for the person themselves
const renameNote = operation({
  name: 'renameNote',
  description: 'Changes the title of a note. NOT_FOUND: there is no such note.',
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
  description: 'The settings of the caller.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'none',
  input: z.object({}),
  output: z.object({ theme: z.string() }),
  errors: []
});

const getInvitation = operation({
  name: 'getInvitation',
  description: 'An invitation, for anyone who has its id.',
  kind: 'read',
  access: 'public',
  belongsTo: 'none',
  input: z.object({ invitationId: id }),
  output: z.object({ spaceName: z.string() }),
  errors: []
});

const createToken = operation({
  name: 'createToken',
  description: 'Makes a token, for the person themselves.',
  kind: 'write',
  access: 'session',
  belongsTo: 'none',
  input: z.object({}),
  output: z.object({ token: z.string() }),
  errors: []
});

// Two tools that are not operations: one that sends a request of its own, and one that breaks
const getTheme = tool({
  name: 'getTheme',
  description: 'The theme of the caller, in capitals.',
  kind: 'read',
  input: z.object({ loud: z.boolean() }),
  run: async ({ loud }, send) => {
    const response = await send('/api/getSettings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    const { theme } = (await response.json()) as { theme: string };
    return answer({ theme: loud ? theme.toUpperCase() : theme });
  }
});

const breakThing = tool({
  name: 'breakThing',
  description: 'Breaks.',
  kind: 'write',
  input: z.object({}),
  run: async () => {
    throw new Error('the reason, which is for the log');
  }
});

interface Options {
  /** What the caller is in the space the input names. Left out, the owner; null means the space does not exist for them */
  membership?: Membership | null;
  /** What the implementation of renameNote does. Left out, it renames as the input says */
  rename?: Parameters<typeof implement<typeof renameNote>>[1];
  /** The tools that are not operations. Left out, the two above */
  tools?: Tool[];
}

/**
 * An app with the four operations and the MCP entrance. A request with one of the two keys is Ada calling with that
 * key; a request without a bearer token is Ada signed in. What the implementations were given is collected in
 * calls, the headers of every request whose caller was looked up in identified, and what the server reported about
 * itself in reported.
 */
function setup({ membership = { role: 'owner' }, rename, tools = [getTheme, breakThing] }: Options = {}) {
  const calls: { user?: CurrentUser; apiKeyId?: string | null; input: unknown }[] = [];
  const identified: Headers[] = [];
  const reported: { error: unknown; where: string }[] = [];

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
      })
    ],
    mcp: { version: '1.2.3', tools },
    identifyCaller: async (headers) => {
      identified.push(headers);
      const token = bearerToken(headers.get('authorization'));
      if (token === null) return { user: ADA };
      const apiKey = KEYS[token];
      return apiKey ? { user: ADA, apiKey } : { user: null };
    },
    spaceMembership: async () => membership,
    conversationAccess: async () => null,
    reportError: (error, where) => reported.push({ error, where })
  });

  /** A client of the MCP entrance that calls with this key. headers are sent along with every request it makes */
  function connect(key: string, era: McpEra = 'modern', headers: Record<string, string> = {}) {
    return connectMcp(async (path, init = {}) => {
      const merged = new Headers(init.headers);
      merged.set('authorization', `Bearer ${key}`);
      for (const [name, value] of Object.entries(headers)) merged.set(name, value);
      return app.request(path, { ...init, headers: merged });
    }, era);
  }

  /** One request to the MCP entrance as it is: the protocol's request for the list of tools */
  function post(headers: Record<string, string>) {
    return app.request(MCP_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
    });
  }

  return { app, connect, post, calls, identified, reported };
}

/** A renameNote input that fits the definition */
const RENAME = { spaceId: S1, noteId: N1, title: 'Groceries' };

/** The error code and the status of a failed response */
async function failed(response: Response) {
  const body = (await response.json()) as { error: { code: string; message: string } };
  return { status: response.status, code: body.error.code };
}

for (const era of ERAS) {
  test(`${era}: an operation done as the person a key belongs to is a tool; one anyone may call and one kept for the person themselves are not`, async () => {
    const { connect } = setup();
    const client = await connect(WRITE_KEY, era);

    assert.equal(client.getProtocolEra(), era);
    assert.deepEqual(client.getServerVersion(), { name: 'pocketmice', version: '1.2.3' });

    const { tools } = await client.listTools();
    // getInvitation, which anyone may call, and createToken, which only the person does, are not among them
    assert.deepEqual(tools.map(({ name }) => name).sort(), ['breakThing', 'getSettings', 'getTheme', 'renameNote']);

    // What is not a tool cannot be called as one, whatever it is over HTTP
    for (const name of ['getInvitation', 'createToken']) {
      const called = await callTool(client, name, {}).catch((thrown) => ({ isError: true, texts: [String(thrown)] }));
      assert.equal(called.isError, true, `${name} should not be callable as a tool`);
    }
  });

  test(`${era}: a tool is the operation under its own name: its description, its input, and whether it changes anything`, async () => {
    const { connect } = setup();
    const { tools } = await (await connect(WRITE_KEY, era)).listTools();
    const named = (name: string) => tools.find((listed) => listed.name === name);

    const write = named('renameNote');
    assert.equal(write?.description, renameNote.description);
    assert.deepEqual(write?.inputSchema.required, ['spaceId', 'noteId', 'title']);
    assert.deepEqual(Object.keys(write?.inputSchema.properties ?? {}), ['spaceId', 'noteId', 'title', 'notify']);
    // And no other field: the model is told before it calls
    assert.equal(write?.inputSchema.additionalProperties, false);
    // No key destroys content, so no write is marked as one that destroys
    assert.deepEqual(write?.annotations, { readOnlyHint: false, destructiveHint: false });

    const read = named('getSettings');
    assert.equal(read?.description, getSettings.description);
    assert.deepEqual(read?.annotations, { readOnlyHint: true });

    // What an operation answers with is not described in the list: the answer is JSON that says what it is
    assert.equal(write?.outputSchema, undefined);
  });

  test(`${era}: calling a tool calls the operation, as the person whose key it is`, async () => {
    const { connect, calls } = setup();
    const client = await connect(WRITE_KEY, era);

    const called = await callTool(client, 'renameNote', RENAME);

    assert.deepEqual(called, {
      texts: ['{"note":{"id":"22222222-2222-4222-8222-222222222222","title":"Groceries"}}'],
      isError: false
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.user, ADA);
    assert.equal(calls[0]?.apiKeyId, 'k-write');
    // The default of the definition is filled in, as for a request from outside
    assert.deepEqual(calls[0]?.input, { ...RENAME, notify: false });
  });

  test(`${era}: a refusal comes back as a result that says the error code and the message`, async () => {
    const refused = setup({
      rename: async () => {
        throw new ApiError('NOT_FOUND', 'There is no note 2222.');
      }
    });
    assert.deepEqual(await callTool(await refused.connect(WRITE_KEY, era), 'renameNote', RENAME), {
      texts: ['NOT_FOUND: There is no note 2222.'],
      isError: true
    });

    const viewer = setup({ membership: { role: 'viewer' } });
    assert.deepEqual(await callTool(await viewer.connect(WRITE_KEY, era), 'renameNote', RENAME), {
      texts: ['FORBIDDEN: This takes the role editor in the space, and yours is viewer.'],
      isError: true
    });

    const stranger = setup({ membership: null });
    const unknown = await callTool(await stranger.connect(WRITE_KEY, era), 'renameNote', RENAME);
    assert.equal(unknown.isError, true);
    assert.match(unknown.texts[0] ?? '', /^UNKNOWN_SPACE: /);

    for (const { calls } of [viewer, stranger]) assert.equal(calls.length, 0);
  });

  test(`${era}: a read-only key lists every tool, reads with them, and is refused by one that writes`, async () => {
    const { connect, calls } = setup();
    const client = await connect(READ_KEY, era);

    assert.equal((await client.listTools()).tools.length, 4);
    assert.deepEqual(await callTool(client, 'getSettings', {}), { texts: ['{"theme":"dark"}'], isError: false });
    assert.equal(calls.length, 1);

    assert.deepEqual(await callTool(client, 'renameNote', RENAME), {
      texts: ['FORBIDDEN: This API key is read-only, and this request changes something.'],
      isError: true
    });
    assert.equal(calls.length, 1, 'the write should not have reached its implementation');
  });

  test(`${era}: a call that does not fit the input of the tool is refused before anything is sent`, async () => {
    const { connect, calls, identified } = setup();
    const client = await connect(WRITE_KEY, era);
    const before = identified.length;

    const called = await callTool(client, 'renameNote', { ...RENAME, title: '' });

    assert.equal(called.isError, true);
    assert.match(called.texts[0] ?? '', /title/);
    assert.equal(calls.length, 0);
    // The caller was looked up once, for the request the call came in, and no request was sent for the tool
    assert.equal(identified.length, before + 1);

    // A field the tool does not have is refused the same way, and not dropped on the way to the operation
    const misspelt = await callTool(client, 'renameNote', { ...RENAME, notfy: true });
    assert.equal(misspelt.isError, true);
    assert.match(misspelt.texts[0] ?? '', /notfy/);
    assert.equal(calls.length, 0);
  });

  test(`${era}: a tool that is not an operation sends its own requests, as the caller`, async () => {
    const { connect, calls } = setup();
    const client = await connect(READ_KEY, era);

    assert.deepEqual(await callTool(client, 'getTheme', { loud: true }), {
      texts: ['{"theme":"DARK"}'],
      isError: false
    });
    assert.equal(calls[0]?.apiKeyId, 'k-read');
  });

  test(`${era}: a tool that breaks answers INTERNAL, and the reason goes to the log alone`, async () => {
    const { connect, reported } = setup();
    const client = await connect(WRITE_KEY, era);

    assert.deepEqual(await callTool(client, 'breakThing', {}), {
      texts: ['INTERNAL: The server ran into an internal error.'],
      isError: true
    });
    assert.equal(reported.length, 1);
    assert.equal(reported[0]?.where, `${MCP_PATH} breakThing`);
    assert.match(String(reported[0]?.error), /the reason, which is for the log/);
  });

  test(`${era}: the request a tool sends carries the key, and nothing else of the request the tool came in`, async () => {
    const { connect, identified } = setup();
    const client = await connect(WRITE_KEY, era, {
      cookie: 'pocketmice.session_token=abc',
      'x-forwarded-for': '203.0.113.7',
      'x-something-else': 'yes'
    });
    identified.length = 0;

    await callTool(client, 'getSettings', {});

    // Two lookups: one for the request the call came in, one for the request the tool sent
    assert.equal(identified.length, 2);
    const [came, sent] = identified;
    assert.equal(came?.get('cookie'), 'pocketmice.session_token=abc');
    assert.equal(sent?.get('authorization'), `Bearer ${WRITE_KEY}`);
    for (const name of ['cookie', 'x-forwarded-for', 'x-something-else']) assert.equal(sent?.get(name), null, name);
  });
}

test('the list of tools does not change while the server runs, and the entrance says so: a client that asks to be told of changes is answered and let go', async () => {
  const { app, connect } = setup();
  for (const era of ERAS) {
    assert.equal((await connect(WRITE_KEY, era)).getServerCapabilities()?.tools?.listChanged, false, era);
  }

  // A client that asks all the same, in the revision that has a request for it. What it is answered with is kept,
  // to see that the answer ends: a stream left open is held until the client leaves, by a server that has nothing
  // to send down it
  const answers: { method: string; answer: Response }[] = [];
  const client = await connectMcp(async (path, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${WRITE_KEY}`);
    const response = await app.request(path, { ...init, headers });
    const { method = '' } = JSON.parse(typeof init.body === 'string' ? init.body : '{}') as { method?: string };
    answers.push({ method, answer: response.clone() });
    return response;
  }, 'modern');

  try {
    await client.listen({ toolsListChanged: true });

    const listened = answers.find(({ method }) => method === 'subscriptions/listen');
    assert.ok(listened, 'the client should have sent its request to listen');
    let timer: NodeJS.Timeout | undefined;
    const ended = await Promise.race([
      listened.answer.text(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 1000);
      })
    ]);
    clearTimeout(timer);
    assert.notEqual(ended, null, 'the answer to a request to listen should have ended');
    // It was told what it will be sent: nothing
    assert.match(ended ?? '', /"notifications\/subscriptions\/acknowledged","params":\{"notifications":\{\}/);
  } finally {
    await client.close();
  }
});

test('without an API key that works the protocol is not spoken: not for a key that does not work, and not for someone signed in', async () => {
  const { post, identified } = setup();

  // No bearer token. The stand-in would say this is Ada, signed in: the entrance does not ask
  assert.deepEqual(await failed(await post({})), { status: 401, code: 'UNAUTHENTICATED' });
  assert.deepEqual(await failed(await post({ origin: WEB_ORIGIN, cookie: 'pocketmice.session_token=abc' })), {
    status: 401,
    code: 'UNAUTHENTICATED'
  });
  assert.equal(identified.length, 0);

  assert.deepEqual(await failed(await post({ authorization: 'Bearer pm_gone' })), {
    status: 401,
    code: 'UNAUTHENTICATED'
  });

  // With a key that works, the same request is answered by the protocol
  const answered = await post({ authorization: `Bearer ${WRITE_KEY}` });
  assert.equal(answered.status, 200);
});

test('a web page that is not allowed to call the api does not reach the MCP entrance either', async () => {
  const { post } = setup();

  const response = await post({ authorization: `Bearer ${WRITE_KEY}`, origin: 'https://evil.example' });

  assert.deepEqual(await failed(response), { status: 403, code: 'FORBIDDEN' });
});

test('a body over the limit, or one sent in chunks, is refused by what the request declares, as for an operation', async () => {
  const { post } = setup();

  const large = await post({ authorization: `Bearer ${WRITE_KEY}`, 'content-length': String(MAX_MCP_INPUT_BYTES + 1) });
  assert.deepEqual(await failed(large), { status: 413, code: 'INPUT_TOO_LARGE' });

  const chunked = await post({ authorization: `Bearer ${WRITE_KEY}`, 'transfer-encoding': 'chunked' });
  assert.deepEqual(await failed(chunked), { status: 400, code: 'INVALID_INPUT' });
});

test('two tools of one name are refused when the entrance is mounted', () => {
  assert.throws(() => setup({ tools: [getTheme, getTheme] }), /more than one MCP tool called getTheme/);
  // Also a tool that takes the name of an operation
  const impostor = tool({ ...getTheme, name: 'getSettings' } as Parameters<typeof tool>[0]);
  assert.throws(() => setup({ tools: [impostor] }), /more than one MCP tool called getSettings/);
});
