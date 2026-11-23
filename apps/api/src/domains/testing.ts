// The setup the tests of the domains share: a temporary database and a temporary folder for the storage, people in
// the database, and calling the api the way a web page or an agent does. It is not a test, and nothing a running server uses imports it.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before } from 'node:test';
import { type ApiClient, createApiClient } from '@pocketmice/client/api';
import { apiKeyAuthorization } from '@pocketmice/contract/domains/apiKey';
import { connectDb, type Db } from '@pocketmice/db';
import { users } from '@pocketmice/db/schema/auth';
import { createTestDb, type TestDb } from '@pocketmice/db/testing';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.ts';
import { requireEnv } from '../env.ts';
import { describeError } from '../http/errorLog.ts';
import type { CurrentUser } from '../http/operation.ts';
import type { FileStorage } from '../storage/fileStorage.ts';
import { createFolderStorage } from '../storage/folderStorage.ts';
import { identifyCaller } from './apiKey/identifyCaller.ts';
import { domainImplementations } from './implementations.ts';
import { prepareSignIn } from './prepareSignIn.ts';
import { findMembership } from './space/findMembership.ts';

export const WEB_ORIGIN = 'http://localhost:11211';

/** An id that is written correctly and that nothing in the database has */
export const NOBODY = '00000000-0000-4000-8000-000000000000';

/** The request header a test uses to say who is calling, in place of the sign-in cookie */
const TEST_USER_HEADER = 'x-test-user';

export interface TestApi {
  /** The temporary database of this test file */
  readonly db: Db;
  /** The storage of this test file: a temporary folder */
  readonly storage: FileStorage;
  /** The folder that storage is: a test looks into it to see what is really kept */
  readonly storageDir: string;
  /**
   * Adds a person who signed up under this name: their user row, and what every signed-in person has (see
   * prepareSignIn). The sign-in library is not involved; it is tested in domains/auth/auth.test.ts.
   */
  addPerson: (name?: string) => Promise<CurrentUser>;
  /** Calls operations as this person, the way the web app does. Null calls them signed out */
  as: (person: CurrentUser | null) => ApiClient;
  /** Calls operations with this API key, the way an agent does: no web page, no sign-in */
  withKey: (key: string) => ApiClient;
  /**
   * Sends one request as it is, for what is not an operation (the content of files). who is a person, signed in the
   * way the web app is; or an API key; or null for nobody.
   */
  send: (who: CurrentUser | { key: string } | null, path: string, init?: RequestInit) => Promise<Response>;
  /**
   * What the server reported about itself since the last call. A test that expects the server to fail takes the
   * reports here; a report nobody took fails the test it happened in.
   */
  takeReported: () => { error: unknown; where: string }[];
}

/**
 * Call it once at the top of a test file. The file gets a temporary database and a temporary folder of its own,
 * both removed when the file is done, and an api on top of them with every operation and the content address.
 */
export function useTestApi(): TestApi {
  let testDb: TestDb | undefined;
  let db: Db | undefined;
  let stored: { storage: FileStorage; dir: string } | undefined;
  let app: ReturnType<typeof createApp> | undefined;
  let reported: { error: unknown; where: string }[] = [];

  before(async () => {
    testDb = await createTestDb(requireEnv('DATABASE_URL'));
    const connected = connectDb(testDb.url);
    db = connected;
    const dir = await mkdtemp(join(tmpdir(), 'pocketmice-test-storage-'));
    const storage = createFolderStorage(dir);
    stored = { storage, dir };
    const reportError = (error: unknown, where: string) => reported.push({ error, where });
    app = createApp({
      // The sign-in library has no part in these tests
      auth: { handler: async () => new Response(null, { status: 404 }) },
      webOrigins: [WEB_ORIGIN],
      implementations: domainImplementations({
        db: connected,
        storage,
        version: '1.2.3',
        // A server that sends no mail. Signing in with a code is tested in domains/auth
        signIn: { method: 'password' },
        reportError
      }),
      content: { db: connected, storage },
      // An API key is recognised the way a running server does it. Who is signed in is read from the test's header,
      // which holds the id of a user row
      identifyCaller: identifyCaller(connected, async (headers) => {
        const id = headers.get(TEST_USER_HEADER);
        if (id === null) return { user: null };
        const [user] = await connected.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, id));
        return { user: user ?? null };
      }),
      spaceMembership: (spaceId, userId) => findMembership(connected, spaceId, userId),
      reportError
    });
  });

  afterEach(() => {
    const left = reported;
    reported = [];
    assert.deepEqual(
      left.map(({ error, where }) => `${where}: ${describeError(error)}`),
      [],
      'the server reported an internal error that the test did not expect'
    );
  });

  after(async () => {
    // Disconnect first, then drop: a database someone is connected to cannot be dropped
    await db?.$client.end();
    await testDb?.drop();
    if (stored) await rm(stored.dir, { recursive: true, force: true });
  });

  function ready() {
    if (!db || !app || !stored) throw new Error('useTestApi is used before the test file has started.');
    return { db, app, ...stored };
  }

  return {
    get db() {
      return ready().db;
    },

    get storage() {
      return ready().storage;
    },

    get storageDir() {
      return ready().dir;
    },

    async send(who, path, init = {}) {
      const { app } = ready();
      const headers = new Headers(init.headers);
      if (who !== null && 'key' in who) headers.set('authorization', apiKeyAuthorization(who.key));
      else {
        // From the web app, unless the test says which web page it comes from
        if (!headers.has('origin')) headers.set('origin', WEB_ORIGIN);
        if (who !== null) headers.set(TEST_USER_HEADER, who.id);
      }
      return app.request(path, { ...init, headers });
    },

    async addPerson(name = 'Ada') {
      const { db } = ready();
      const [user] = await db
        .insert(users)
        .values({ name, email: `${name.toLowerCase().replaceAll(' ', '.')}-${randomUUID()}@example.com` })
        .returning({ id: users.id, email: users.email });
      if (!user) throw new Error('The user row was not created.');
      await prepareSignIn(db, user.id);
      return user;
    },

    as(person) {
      const { app } = ready();
      return createApiClient({
        baseUrl: 'http://api.test',
        fetch: async (url, init) =>
          app.request(url, {
            ...init,
            headers: { ...init.headers, origin: WEB_ORIGIN, ...(person && { [TEST_USER_HEADER]: person.id }) }
          }),
        reportError: (error, name) => assert.fail(`the client reported ${describeError(error)} calling ${name}`)
      });
    },

    withKey(key) {
      const { app } = ready();
      return createApiClient({
        baseUrl: 'http://api.test',
        fetch: async (url, init) =>
          app.request(url, { ...init, headers: { ...init.headers, authorization: apiKeyAuthorization(key) } }),
        reportError: (error, name) => assert.fail(`the client reported ${describeError(error)} calling ${name}`)
      });
    },

    takeReported() {
      const taken = reported;
      reported = [];
      return taken;
    }
  };
}
