import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { isOperation } from '@pocketmice/contract/operation';
import { createPocketmice, type PocketmiceConfig } from './pocketmice.ts';
import { PocketmiceError } from './pocketmiceError.ts';

// These tests send nothing: the fetch is a stand-in. That the SDK and a real server agree, over a real connection,
// is tested where a server can be started: apps/api/src/sdk.test.ts.

const SERVER = 'https://drive.example.com';
const KEY = 'pm_test';
const SPACE = '11111111-1111-4111-8111-111111111111';
const FILE = '22222222-2222-4222-8222-222222222222';
const FOLDER = '33333333-3333-4333-8333-333333333333';
const VERSION = '44444444-4444-4444-8444-444444444444';

type Fetch = NonNullable<PocketmiceConfig['fetch']>;

/** A drive whose fetch is a stand-in: it records what was sent, and answers with what `answer` returns */
function setup(answer: Fetch) {
  const sent: { url: string; init: RequestInit }[] = [];
  const drive = createPocketmice({
    url: SERVER,
    apiKey: KEY,
    fetch: async (url, init) => {
      sent.push({ url, init });
      return answer(url, init);
    }
  });
  return { drive, sent };
}

/** An answer whose body is this value as JSON */
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

/** The answer of a server that refuses, with this code */
function refusal(status: number, code: string, message = 'No.'): Response {
  return json(status, { error: { code, message } });
}

/** A download of this content, which is the version VERSION */
function download(content: BodyInit): Response {
  return new Response(content, { headers: { etag: `"${VERSION}"` } });
}

/** What a call that must fail threw, which must be a PocketmiceError */
async function thrownBy(call: Promise<unknown>): Promise<PocketmiceError> {
  try {
    await call;
  } catch (thrown) {
    assert.ok(thrown instanceof PocketmiceError, `the call threw ${String(thrown)}, which is not a PocketmiceError`);
    return thrown;
  }
  return assert.fail('the call should have failed');
}

/** The bytes a request was sent with: its body, which for an upload is a Blob */
async function bytesSent(init: RequestInit | undefined): Promise<Uint8Array> {
  assert.ok(init?.body instanceof Blob, 'the body of an upload should be a Blob');
  return new Uint8Array(await init.body.arrayBuffer());
}

/** The path of an address, and its query as the server reads it */
function addressOf(url: string) {
  const { origin, pathname, searchParams } = new URL(url);
  return { origin, pathname, query: Object.fromEntries(searchParams) };
}

test('a method is a POST of the input as JSON to the operation of its name, sent with the key', async () => {
  const { drive, sent } = setup(async () => json(200, { file: { id: FILE, name: 'a.md' } }));

  const answer = await drive.getFile({ spaceId: SPACE, fileId: FILE });

  assert.deepEqual(answer, { file: { id: FILE, name: 'a.md' } });
  assert.deepEqual(sent, [
    {
      url: 'https://drive.example.com/api/getFile',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer pm_test' },
        body: `{"spaceId":"${SPACE}","fileId":"${FILE}"}`,
        redirect: 'manual'
      }
    }
  ]);
});

test('an input in which nothing is required may be left out, and is sent as {}', async () => {
  const { drive, sent } = setup(async () => json(200, { spaces: [] }));

  assert.deepEqual(await drive.getSpaces(), { spaces: [] });
  assert.deepEqual(await drive.getSpaces({}), { spaces: [] });

  assert.deepEqual(
    sent.map(({ init }) => init.body),
    ['{}', '{}']
  );
});

test('every operation of the contract that an API key may call is a method, and besides them only the three of the content', async () => {
  // Where the contract keeps its definitions is asked of the rules that resolve an import of it
  const dir = new URL('./domains/', import.meta.resolve('@pocketmice/contract/operation'));
  const forAKey: string[] = [];
  const forThePerson: string[] = [];
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' });
  for (const file of files.filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
    const exported: Record<string, unknown> = await import(new URL(file, dir).href);
    for (const value of Object.values(exported)) {
      if (isOperation(value)) (value.access === 'session' ? forThePerson : forAKey).push(value.name);
    }
  }
  assert.ok(forAKey.length > 0 && forThePerson.length > 0, `found too few operations under ${dir.pathname}`);

  const { drive } = setup(async () => json(200, {}));

  assert.deepEqual(
    Object.keys(drive).sort(),
    [...forAKey, 'downloadFile', 'uploadFile', 'uploadFileVersion'].sort(),
    'an operation is missing when its file is not among the DEFINITIONS in pocketmice.ts'
  );
});

test('the types refuse an input the contract does not take, and what only the person does is not there', async () => {
  const { drive } = setup(async () => json(200, {}));

  // @ts-expect-error parentId has to be said: null for directly in the space
  await drive.getFiles({ spaceId: SPACE });
  // @ts-expect-error a field that is misspelt is refused where it is written
  await drive.getFile({ spaceId: SPACE, fileID: FILE });
  // @ts-expect-error for an upload too, directly in the space is said, not left out
  await drive.uploadFile({ spaceId: SPACE, name: 'a.md', content: '' });

  // @ts-expect-error making a key is for the person
  assert.equal(drive.createApiKey, undefined);
  // @ts-expect-error deleting for good is for the person
  assert.equal(drive.deleteFile, undefined);
  // @ts-expect-error so is emptying the trash
  assert.equal(drive.emptyTrash, undefined);
});

test('a call the server refuses throws a PocketmiceError with the code, the message and the method', async () => {
  const { drive } = setup(async () => refusal(404, 'NOT_FOUND', 'There is no such file.'));

  const error = await thrownBy(drive.getFile({ spaceId: SPACE, fileId: FILE }));

  assert.equal(error.code, 'NOT_FOUND');
  assert.equal(error.message, 'There is no such file.');
  assert.equal(error.operation, 'getFile');
  assert.equal(error.name, 'PocketmiceError');
  assert.equal('cause' in error, false);
  // @ts-expect-error a code nobody answers with is refused where it is written
  assert.equal(error.code === 'NOT_FUOND', false);
});

test('a server that is not reached is UNREACHABLE, and what fetch threw is the cause', async () => {
  // What Node's fetch throws: the reason is not in its message, it is in its cause
  const refused = new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 127.0.0.1:1') });
  const { drive } = setup(async () => {
    throw refused;
  });

  for (const call of [
    drive.getSpaces(),
    drive.uploadFile({ spaceId: SPACE, parentId: null, name: 'a.md', content: 'a' }),
    drive.downloadFile({ spaceId: SPACE, fileId: FILE })
  ]) {
    const error = await thrownBy(call);
    assert.equal(error.code, 'UNREACHABLE');
    assert.equal(error.message, 'Could not reach the server: fetch failed');
    assert.equal(error.cause, refused);
  }
});

test('a fetch that fails any other way, like one that stopped waiting, is UNEXPECTED, and what it threw is the cause', async () => {
  const gaveUp = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  const { drive } = setup(async () => {
    throw gaveUp;
  });

  for (const call of [
    drive.getSpaces(),
    drive.uploadFileVersion({ spaceId: SPACE, fileId: FILE, baseVersionId: VERSION, content: 'a' }),
    drive.downloadFile({ spaceId: SPACE, fileId: FILE })
  ]) {
    const error = await thrownBy(call);
    assert.equal(error.code, 'UNEXPECTED');
    assert.equal(error.cause, gaveUp);
  }
});

test('an input JSON cannot express is UNEXPECTED, what JSON threw is the cause, and nothing is sent', async () => {
  const { drive, sent } = setup(async () => json(200, {}));
  const circular: Record<string, unknown> = { spaceId: SPACE, fileId: FILE };
  circular.self = circular;

  const error = await thrownBy(drive.getFile(circular as { spaceId: string; fileId: string }));

  assert.equal(error.code, 'UNEXPECTED');
  assert.equal(error.operation, 'getFile');
  assert.ok(error.cause instanceof TypeError);
  assert.equal(sent.length, 0);
});

test('two calls at once each keep their own cause', async () => {
  const first = new TypeError('the first');
  const second = new TypeError('the second');
  const { drive } = setup(async (url) => {
    // The first call fails after the second has
    if (url.endsWith('getSpaces')) await new Promise((resolve) => setTimeout(resolve, 5));
    throw url.endsWith('getSpaces') ? first : second;
  });

  const [slow, fast] = await Promise.all([thrownBy(drive.getSpaces()), thrownBy(drive.getProfile())]);

  assert.equal(slow.cause, first);
  assert.equal(fast.cause, second);
});

test('a redirect is not followed: the call fails with the status the server answered', async () => {
  // What a server answers that is reached over http and wants https
  const { drive, sent } = setup(
    async (url) => new Response(null, { status: 308, headers: { location: url.replace('https:', 'http:') } })
  );

  for (const call of [
    drive.getSpaces(),
    drive.uploadFile({ spaceId: SPACE, parentId: null, name: 'a.md', content: 'a' }),
    drive.downloadFile({ spaceId: SPACE, fileId: FILE })
  ]) {
    const error = await thrownBy(call);
    assert.equal(error.code, 'BAD_RESPONSE');
    assert.match(error.message, /with status 308 and no error code/);
  }
  // Every request says so itself: a fetch that is passed in is told too
  assert.deepEqual(
    sent.map(({ init }) => init.redirect),
    ['manual', 'manual', 'manual']
  );
});

test('an address that is not one, and a key that is missing or is not a key, fail when the drive is built', () => {
  assert.throws(() => createPocketmice({ url: 'drive.example.com', apiKey: KEY }), /address of the server/);
  assert.throws(() => createPocketmice({ url: '', apiKey: KEY }), /address of the server/);
  // The scheme forgotten before a host and a port: that is a URL too, with the host for its scheme, and no request
  // can go to it. Left to the first call, it would throw there what is not a PocketmiceError
  assert.throws(() => createPocketmice({ url: 'localhost:11210', apiKey: KEY }), /address of the server/);
  assert.throws(() => createPocketmice({ url: 'drive.example.com:443', apiKey: KEY }), /address of the server/);

  // An environment variable that is not set is how a key usually goes missing
  const notSet = process.env.POCKETMICE_API_KEY_THAT_IS_NOT_SET as string;
  for (const apiKey of [notSet, '', 'sk-not-ours']) {
    assert.throws(() => createPocketmice({ url: SERVER, apiKey }), /API key is missing, or is not one/);
  }
});

test("the fetch is called on its own, not as the config's: a browser's fetch passed in as it is works", async () => {
  // What a browser's fetch does when it is called as a method of anything but the window
  const browserFetch: Fetch = async function (this: unknown) {
    if (this !== undefined) throw new TypeError('Illegal invocation');
    return json(200, { spaces: [] });
  };
  const drive = createPocketmice({ url: SERVER, apiKey: KEY, fetch: browserFetch });

  assert.deepEqual(await drive.getSpaces(), { spaces: [] });
});

test('with no fetch passed, the fetch of the runtime sends the requests', async (t) => {
  const sent: unknown[] = [];
  t.mock.method(globalThis, 'fetch', async (url: unknown) => {
    sent.push(url);
    return json(200, { spaces: [] });
  });
  const drive = createPocketmice({ url: SERVER, apiKey: KEY });

  assert.deepEqual(await drive.getSpaces(), { spaces: [] });
  assert.deepEqual(sent, ['https://drive.example.com/api/getSpaces']);
});

test('uploadFile is a PUT of the content to the address of the content, as the query of a new file', async () => {
  const { drive, sent } = setup(async () => json(200, { file: { id: FILE } }));
  const content = new TextEncoder().encode('# hello');
  // A name with what a query gives a meaning of its own, and with another script
  const name = 'Q3 报告 & notes = a+b.md';

  const inFolder = await drive.uploadFile({ spaceId: SPACE, parentId: FOLDER, name, content });
  await drive.uploadFile({ spaceId: SPACE, parentId: null, name: 'top.md', content: 'text' });

  assert.deepEqual(inFolder, { file: { id: FILE } });
  assert.deepEqual(
    sent.map(({ url }) => addressOf(url)),
    [
      { origin: SERVER, pathname: '/api/content', query: { spaceId: SPACE, parentId: FOLDER, name } },
      // Directly in the space is null for the method, and left out of the query
      { origin: SERVER, pathname: '/api/content', query: { spaceId: SPACE, name: 'top.md' } }
    ]
  );
  // The content is handed to fetch as a Blob, which is what sends it with its length; and nothing but the key is
  // added to the request
  assert.deepEqual(
    { ...sent[0]?.init, body: undefined },
    { method: 'PUT', headers: { authorization: 'Bearer pm_test' }, body: undefined, redirect: 'manual' }
  );
  assert.deepEqual(await bytesSent(sent[0]?.init), content);
  assert.deepEqual(await bytesSent(sent[1]?.init), new TextEncoder().encode('text'));
});

test('content is handed to fetch in pieces of 64 KB, whatever it came as: none is the whole of a large upload', async () => {
  const { drive, sent } = setup(async () => json(200, { file: { id: FILE } }));
  // Two pieces and a part of a third. The text is of characters that are two bytes each: a piece is so many bytes
  const bytes = new Uint8Array(150_000).map((_, at) => at % 251);
  const text = 'é'.repeat(75_000);

  for (const content of [bytes, text, new Blob([bytes])]) {
    await drive.uploadFile({ spaceId: SPACE, parentId: null, name: 'large.bin', content });
  }

  const expected = [Buffer.from(bytes), Buffer.from(text), Buffer.from(bytes)];
  for (const [at, { init }] of sent.entries()) {
    assert.ok(init.body instanceof Blob);
    const pieces: Uint8Array[] = [];
    for await (const piece of init.body.stream()) pieces.push(piece);

    assert.deepEqual(
      pieces.map((piece) => piece.length),
      [64 * 1024, 64 * 1024, 150_000 - 2 * 64 * 1024]
    );
    assert.deepEqual(Buffer.concat(pieces), expected[at]);
  }
});

test('content of no bytes is handed to fetch as empty text, and a Blob whose pieces do not add up to it as it came', async () => {
  const { drive, sent } = setup(async () => json(200, { file: { id: FILE } }));
  const upload = { spaceId: SPACE, parentId: null, name: 'a.bin' };

  // Deno sends a Blob of no bytes without a length, and the server takes no upload without one
  for (const content of ['', new Uint8Array(0), new Blob([])]) await drive.uploadFile({ ...upload, content });
  assert.deepEqual(
    sent.map(({ init }) => init.body),
    ['', '', '']
  );

  // What Bun gives for a file on disk: a Blob whose pieces, put together, have no bytes. Sent as those pieces, the
  // file would be stored empty, and the upload would still succeed
  class OnDiskInBun extends Blob {
    override slice(): Blob {
      return new Blob([]);
    }
  }
  const onDisk = new OnDiskInBun(['kept on disk']);
  await drive.uploadFile({ ...upload, content: onDisk });
  assert.equal(sent[3]?.init.body, onDisk);
});

test('a Blob of no bytes that cannot be read fails the upload, and nothing is sent: it is not stored as an empty file', async () => {
  const { drive, sent } = setup(async () => json(200, { file: { id: FILE } }));

  // What Bun gives for a path where there is no file: a Blob that says it has no bytes, and fails when it is read
  const notThere = Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
  class NotThereInBun extends Blob {
    override text(): Promise<string> {
      return Promise.reject(notThere);
    }
  }
  const content = new NotThereInBun([]);

  const error = await thrownBy(drive.uploadFile({ spaceId: SPACE, parentId: null, name: 'a.bin', content }));

  assert.equal(error.code, 'UNEXPECTED');
  assert.equal(error.message, 'The content uploadFile was given could not be read.');
  assert.equal(error.operation, 'uploadFile');
  assert.equal(error.cause, notThere);
  assert.equal(sent.length, 0);
});

test('what is not content is refused, and nothing is sent: a stream would be stored as the text of its name', async () => {
  const { drive, sent } = setup(async () => json(200, { file: { id: FILE } }));
  const upload = { spaceId: SPACE, parentId: null, name: 'a.md' };

  // What a caller without types may hand over. A stream is refused by the types too: it does not say how long it is
  const notContent = [new ReadableStream(), Readable.from(['a']), { text: 'a' }, [97], 42, null, undefined];
  for (const content of notContent) {
    // @ts-expect-error none of them is text, bytes or a Blob
    const error = await thrownBy(drive.uploadFile({ ...upload, content }));
    assert.equal(error.code, 'UNEXPECTED');
    assert.equal(error.message, 'What uploadFile was given as content is not text, bytes or a Blob.');
    assert.equal(error.operation, 'uploadFile');
  }
  const version = { spaceId: SPACE, fileId: FILE, baseVersionId: VERSION };
  // @ts-expect-error nor is a stream content for a new version
  const error = await thrownBy(drive.uploadFileVersion({ ...version, content: new ReadableStream() }));
  assert.deepEqual([error.code, error.operation], ['UNEXPECTED', 'uploadFileVersion']);

  assert.equal(sent.length, 0);
});

test('uploadFileVersion is a PUT that names the file and the version being replaced', async () => {
  const { drive, sent } = setup(async () => json(200, { file: { id: FILE } }));
  const content = new Blob(['# hello, again']);

  const answer = await drive.uploadFileVersion({ spaceId: SPACE, fileId: FILE, baseVersionId: VERSION, content });

  assert.deepEqual(answer, { file: { id: FILE } });
  assert.equal(sent.length, 1);
  assert.deepEqual(addressOf(sent[0]?.url ?? ''), {
    origin: SERVER,
    pathname: '/api/content',
    query: { spaceId: SPACE, fileId: FILE, baseVersionId: VERSION }
  });
  assert.equal(sent[0]?.init.method, 'PUT');
  assert.deepEqual(await bytesSent(sent[0]?.init), new TextEncoder().encode('# hello, again'));
});

test('downloadFile is a GET, and answers with the version that was sent and its bytes, read one of three ways', async () => {
  const { drive, sent } = setup(async () => download('# héllo'));

  const asText = await drive.downloadFile({ spaceId: SPACE, fileId: FILE });
  assert.equal(asText.versionId, VERSION);
  assert.equal(await asText.text(), '# héllo');

  const asBytes = await drive.downloadFile({ spaceId: SPACE, fileId: FILE, versionId: VERSION });
  assert.deepEqual(await asBytes.bytes(), new TextEncoder().encode('# héllo'));

  const asStream = await drive.downloadFile({ spaceId: SPACE, fileId: FILE });
  assert.equal(await new Response(asStream.body).text(), '# héllo');

  assert.deepEqual(
    sent.map(({ url, init }) => ({ ...addressOf(url), init })),
    [
      {
        origin: SERVER,
        pathname: '/api/content',
        query: { spaceId: SPACE, fileId: FILE },
        init: { method: 'GET', headers: { authorization: 'Bearer pm_test' }, redirect: 'manual' }
      },
      {
        origin: SERVER,
        pathname: '/api/content',
        query: { spaceId: SPACE, fileId: FILE, versionId: VERSION },
        init: { method: 'GET', headers: { authorization: 'Bearer pm_test' }, redirect: 'manual' }
      },
      {
        origin: SERVER,
        pathname: '/api/content',
        query: { spaceId: SPACE, fileId: FILE },
        init: { method: 'GET', headers: { authorization: 'Bearer pm_test' }, redirect: 'manual' }
      }
    ]
  );
});

test('a download whose etag a proxy marked as weak still says which version it is', async () => {
  // What nginx makes of the etag of an answer it compresses
  const { drive } = setup(async () => new Response('# hello', { headers: { etag: `W/"${VERSION}"` } }));

  const download = await drive.downloadFile({ spaceId: SPACE, fileId: FILE });

  assert.equal(download.versionId, VERSION);
  assert.equal(await download.text(), '# hello');
});

test('a download of content that is empty has no bytes, and still says which version it is', async () => {
  // An answer with no body at all, as a runtime may give one for content of no bytes
  const { drive } = setup(async () => download(null as unknown as BodyInit));

  const empty = await drive.downloadFile({ spaceId: SPACE, fileId: FILE });
  assert.equal(empty.versionId, VERSION);
  assert.equal(await new Response(empty.body).text(), '');

  assert.equal(await (await drive.downloadFile({ spaceId: SPACE, fileId: FILE })).text(), '');
  assert.equal((await (await drive.downloadFile({ spaceId: SPACE, fileId: FILE })).bytes()).length, 0);
});

test('a request to the content that the server refuses throws its code, like a method of an operation', async () => {
  const { drive } = setup(async (url) =>
    url.includes('baseVersionId')
      ? refusal(409, 'CONFLICT', 'Somebody wrote to the file since.')
      : refusal(404, 'NOT_FOUND', 'There is no such file.')
  );

  const stale = await thrownBy(
    drive.uploadFileVersion({ spaceId: SPACE, fileId: FILE, baseVersionId: VERSION, content: 'mine' })
  );
  assert.equal(stale.code, 'CONFLICT');
  assert.equal(stale.message, 'Somebody wrote to the file since.');
  assert.equal(stale.operation, 'uploadFileVersion');

  const noFolder = await thrownBy(drive.uploadFile({ spaceId: SPACE, parentId: FOLDER, name: 'a.md', content: 'a' }));
  assert.deepEqual([noFolder.code, noFolder.operation], ['NOT_FOUND', 'uploadFile']);

  // What was answered is the error, and it is thrown: it is never handed over as the content of the file
  const noFile = await thrownBy(drive.downloadFile({ spaceId: SPACE, fileId: FILE }));
  assert.deepEqual([noFile.code, noFile.operation], ['NOT_FOUND', 'downloadFile']);
});

test('an answer from the content that is not what was agreed is BAD_RESPONSE', async () => {
  const upload = { spaceId: SPACE, parentId: null, name: 'a.md', content: 'a' };

  // A proxy's own page
  const proxy = setup(async () => new Response('<html>Bad Gateway</html>', { status: 502 }));
  const badGateway = await thrownBy(proxy.drive.uploadFile(upload));
  assert.equal(badGateway.code, 'BAD_RESPONSE');
  assert.equal(badGateway.message, 'The server answered uploadFile with status 502 and no error code.');

  // A code a newer server invented is not passed off as one this side knows
  const newer = setup(async () => refusal(402, 'OVER_QUOTA', 'The space is full.'));
  const unknown = await thrownBy(newer.drive.uploadFile(upload));
  assert.equal(unknown.code, 'BAD_RESPONSE');
  assert.match(unknown.message, /does not know: OVER_QUOTA\. The space is full\./);

  const notJson = setup(async () => new Response('OK', { status: 200 }));
  const noFile = await thrownBy(notJson.drive.uploadFile(upload));
  assert.equal(noFile.code, 'BAD_RESPONSE');
  assert.match(noFile.message, /status 200, but the body is not JSON/);

  // A download that does not say which version it is cannot be written over safely
  const noEtag = setup(async () => new Response('# hello'));
  const noVersion = await thrownBy(noEtag.drive.downloadFile({ spaceId: SPACE, fileId: FILE }));
  assert.equal(noVersion.code, 'BAD_RESPONSE');
  assert.match(noVersion.message, /without saying which version/);
});

test('a download without a version whose connection has broken too is still only a BAD_RESPONSE', async () => {
  // Letting go of bytes that are not wanted fails when the connection already broke. Nobody is waiting for that:
  // left unhandled, it would end the whole program
  const { drive } = setup(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError('terminated'));
          }
        })
      )
  );
  const unhandled: unknown[] = [];
  const note = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', note);

  const error = await thrownBy(drive.downloadFile({ spaceId: SPACE, fileId: FILE }));
  // Long enough for a rejection nobody handles to be reported
  await new Promise((resolve) => setTimeout(resolve, 10));
  process.off('unhandledRejection', note);

  assert.equal(error.code, 'BAD_RESPONSE');
  assert.deepEqual(unhandled, []);
});

test('a download that breaks off while it is read is UNREACHABLE', async () => {
  const brokeOff = new TypeError('terminated');
  const { drive } = setup(async () =>
    download(
      new ReadableStream({
        start(controller) {
          controller.error(brokeOff);
        }
      })
    )
  );

  for (const read of ['text', 'bytes'] as const) {
    const answer = await drive.downloadFile({ spaceId: SPACE, fileId: FILE });
    const error = await thrownBy(answer[read]());
    assert.equal(error.code, 'UNREACHABLE');
    assert.equal(error.operation, 'downloadFile');
    assert.equal(error.cause, brokeOff);
  }
});
