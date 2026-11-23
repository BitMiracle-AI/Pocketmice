import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { type AddressInfo, connect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createApiClient } from '@pocketmice/client/api';
import { apiKeyAuthorization, createApiKey } from '@pocketmice/contract/domains/apiKey';
import { SIGN_UP_PATH } from '@pocketmice/contract/domains/auth';
import { FILE_CONTENT_PATH } from '@pocketmice/contract/domains/file';
import { getServerInfo } from '@pocketmice/contract/domains/server';
import { createSpace } from '@pocketmice/contract/domains/space';
import { createTestDb, type TestDb } from '@pocketmice/db/testing';
import { requireEnv } from './env.ts';
import { describeError } from './http/errorLog.ts';

// The process as it runs: main.ts, started the way `pnpm start` starts it, on a temporary database and a temporary
// folder, and called over a real connection.
// Every other test builds an api of its own (useTestApi in domains/testing.ts), in memory or on a port. That goes
// past two things, and only this file goes through them: what main.ts sets on the server and does when told to
// stop, and the set that instances.ts builds from the environment (the database, the storage, the sign-in). A
// mistake there passes every other test and shows only on a server: an address main.ts does not mount, a process
// that drops what it has in hand when a new version is deployed.

const WEB_ORIGIN = 'http://localhost:11211';

/** How long the process may take to say it listens, in milliseconds. It takes about one second */
const START_MS = 30_000;

/** How long a test may take, in milliseconds: a process that has stopped answering fails the test, and is not waited for */
const TEST_MS = 30_000;

let testDb: TestDb | undefined;
let storageDir: string | undefined;
let api: ChildProcess | undefined;
let base = '';
/** What the process printed, shown when it fails to start */
let printed = '';

/** A port nothing listens on now */
async function freePort(): Promise<number> {
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address() as AddressInfo;
  probe.close();
  await once(probe, 'close');
  return port;
}

before(async () => {
  testDb = await createTestDb(requireEnv('DATABASE_URL'));
  storageDir = await mkdtemp(join(tmpdir(), 'pocketmice-test-main-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;

  // Its whole configuration is given here: nothing comes from the .env of whoever runs the tests
  const started = spawn(process.execPath, [fileURLToPath(new URL('./main.ts', import.meta.url))], {
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: testDb.url,
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      API_URL: base,
      WEB_ORIGINS: WEB_ORIGIN,
      STORAGE_DIR: storageDir,
      PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  api = started;

  await new Promise<void>((resolve, reject) => {
    const late = setTimeout(() => reject(new Error(`The api did not start listening:\n${printed}`)), START_MS);
    const read = (chunk: Buffer) => {
      printed += chunk.toString();
      if (!printed.includes('api listening on')) return;
      clearTimeout(late);
      resolve();
    };
    started.stdout?.on('data', read);
    started.stderr?.on('data', read);
    started.once('exit', (code) => {
      clearTimeout(late);
      reject(new Error(`The api exited with code ${code} before it listened:\n${printed}`));
    });
  });
});

after(async () => {
  if (api && api.exitCode === null && api.signalCode === null) {
    api.kill('SIGKILL');
    await once(api, 'exit');
  }
  await testDb?.drop();
  if (storageDir) await rm(storageDir, { recursive: true, force: true });
});

/** The address of the content of a file, with this query */
function contentUrl(query: Record<string, string>): string {
  return `${base}${FILE_CONTENT_PATH}?${new URLSearchParams(query)}`;
}

/**
 * A person who signed up through the sign-in library, a space of theirs, and a read-write key of theirs: what an
 * agent is given to work with.
 */
async function newAgent() {
  const signedUp = await fetch(`${base}${SIGN_UP_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
    body: JSON.stringify({
      name: 'Ada',
      email: `ada-${randomBytes(8).toString('hex')}@example.com`,
      password: 'correct horse battery'
    })
  });
  assert.equal(signedUp.status, 200, `signing up should have worked: ${await signedUp.clone().text()}`);
  const cookie = signedUp.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ');

  // The way the web app calls: the shared client over fetch, with the cookie and the page it comes from
  const asPerson = createApiClient({
    baseUrl: base,
    fetch: (url, init) => fetch(url, { ...init, headers: { ...init.headers, cookie, origin: WEB_ORIGIN } }),
    reportError: (error, name) => assert.fail(`the client reported ${describeError(error)} calling ${name}`)
  });
  const space = await asPerson(createSpace, { name: 'Research notes' });
  assert.ok(space.ok, `createSpace should have worked: ${JSON.stringify(space)}`);
  const key = await asPerson(createApiKey, { name: 'Research agent', permission: 'write' });
  assert.ok(key.ok, `createApiKey should have worked: ${JSON.stringify(key)}`);

  return {
    spaceId: space.data.space.id,
    apiKey: key.data.apiKey,
    headers: { authorization: apiKeyAuthorization(key.data.apiKey.key) }
  };
}

/** Uploads content as a new file and returns the file the server answered with */
async function upload(agent: Awaited<ReturnType<typeof newAgent>>, name: string, content: string) {
  const uploaded = await fetch(contentUrl({ spaceId: agent.spaceId, name }), {
    method: 'PUT',
    headers: agent.headers,
    body: content
  });
  assert.equal(uploaded.status, 200, `the upload should have worked: ${await uploaded.clone().text()}`);
  const { file } = (await uploaded.json()) as {
    file: { id: string; version: { id: string; apiKey: { id: string; name: string } | null } };
  };
  return file;
}

test('a person signs up and makes a key, and an agent uploads a file with it and downloads it again', {
  timeout: TEST_MS
}, async () => {
  const agent = await newAgent();

  const file = await upload(agent, 'notes.md', 'what the agent wrote');
  assert.deepEqual(file.version.apiKey, { id: agent.apiKey.id, name: 'Research agent' });

  const downloaded = await fetch(contentUrl({ spaceId: agent.spaceId, fileId: file.id }), { headers: agent.headers });
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get('etag'), `"${file.version.id}"`);
  assert.equal(await downloaded.text(), 'what the agent wrote');
});

// The last test of the file: it stops the process the others call
test('told to stop, the process answers the upload it has in hand, takes no new connection, and exits', {
  timeout: TEST_MS
}, async () => {
  const agent = await newAgent();
  const started = api;
  assert.ok(started, 'the api should be running');
  const { hostname, port } = new URL(base);
  const url = new URL(contentUrl({ spaceId: agent.spaceId, name: 'half.txt' }));

  // An upload of ten bytes that has sent five when the process is told to stop
  const socket = connect(Number(port), hostname);
  await once(socket, 'connect');
  // What the server answers, once its headers are in. Also settled when the connection ends without them, so that a
  // process that drops the upload fails this test and does not leave it waiting
  const answered = new Promise<string>((resolve) => {
    let answer = '';
    socket.on('data', (chunk: Buffer) => {
      answer += chunk.toString();
      if (answer.includes('\r\n\r\n')) resolve(answer);
    });
    socket.on('error', () => resolve(answer));
    socket.on('close', () => resolve(answer));
  });
  socket.write(
    `PUT ${url.pathname}${url.search} HTTP/1.1\r\nhost: ${url.host}\r\nauthorization: ${agent.headers.authorization}\r\ncontent-length: 10\r\n\r\nfirst`
  );
  // A call sent after it and answered: by now the server has the upload, and waits for the rest of its body
  const waiting = createApiClient({ baseUrl: base, fetch, reportError: () => {} });
  assert.ok((await waiting(getServerInfo, {})).ok, 'the process should still answer before it is told to stop');

  const exited = once(started, 'exit');
  started.kill('SIGTERM');

  // It takes no new connection from here on. It closes its door a moment after the signal, so this is asked until
  // it holds
  let refused = false;
  for (let attempt = 0; attempt < 50 && !refused; attempt += 1) {
    refused = (await waiting(getServerInfo, {})).ok === false;
    if (!refused) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(refused, 'a request sent after the signal should not have been answered');

  socket.write('later');
  const answer = await answered;
  assert.match(answer, /^HTTP\/1\.1 200 /, `the upload in hand should have been answered: "${answer}"`);
  socket.destroy();

  const [code] = await exited;
  assert.equal(code, 0);
});
