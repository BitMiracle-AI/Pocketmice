// The setup the tests of the domains share: a temporary database, people in it, and calling operations the way a web
// page does. It is not a test, and nothing a running server uses imports it.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before } from 'node:test';
import { type ApiClient, createApiClient } from '@pocketmice/client/api';
import { connectDb, type Db } from '@pocketmice/db';
import { users } from '@pocketmice/db/schema/auth';
import { createTestDb, type TestDb } from '@pocketmice/db/testing';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.ts';
import { requireEnv } from '../env.ts';
import { describeError } from '../http/errorLog.ts';
import type { CurrentUser } from '../http/operation.ts';
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
  /**
   * Adds a person who signed up under this name: their user row, and what every signed-in person has (see
   * prepareSignIn). The sign-in library is not involved; it is tested in domains/auth/auth.test.ts.
   */
  addPerson: (name?: string) => Promise<CurrentUser>;
  /** Calls operations as this person, the way the web app does. Null calls them signed out */
  as: (person: CurrentUser | null) => ApiClient;
  /**
   * What the server reported about itself since the last call. A test that expects the server to fail takes the
   * reports here; a report nobody took fails the test it happened in.
   */
  takeReported: () => { error: unknown; where: string }[];
}

/**
 * Call it once at the top of a test file. The file gets a temporary database of its own, dropped when the file is
 * done, and an api on top of it with every operation.
 */
export function useTestApi(): TestApi {
  let testDb: TestDb | undefined;
  let db: Db | undefined;
  let app: ReturnType<typeof createApp> | undefined;
  let reported: { error: unknown; where: string }[] = [];

  before(async () => {
    testDb = await createTestDb(requireEnv('DATABASE_URL'));
    const connected = connectDb(testDb.url);
    db = connected;
    app = createApp({
      // The sign-in library has no part in these tests
      auth: { handler: async () => new Response(null, { status: 404 }) },
      webOrigins: [WEB_ORIGIN],
      implementations: domainImplementations({ db: connected, version: '1.2.3' }),
      // Who is calling is read from the test's header, which holds the id of a user row
      currentUser: async (headers) => {
        const id = headers.get(TEST_USER_HEADER);
        if (id === null) return { user: null };
        const [user] = await connected.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, id));
        return { user: user ?? null };
      },
      spaceMembership: (spaceId, userId) => findMembership(connected, spaceId, userId),
      reportError: (error, where) => reported.push({ error, where })
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
  });

  function ready() {
    if (!db || !app) throw new Error('useTestApi is used before the test file has started.');
    return { db, app };
  }

  return {
    get db() {
      return ready().db;
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

    takeReported() {
      const taken = reported;
      reported = [];
      return taken;
    }
  };
}
