import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { connectDb, type Db } from '@pocketmice/db';
import { migrateDb } from '@pocketmice/db/migrate';
import { users } from '@pocketmice/db/schema/auth';
import { createTestDb, type TestDb } from '@pocketmice/db/testing';
import { sql } from 'drizzle-orm';
import { requireEnv } from './env.ts';

// The temporary database of this file
let testDb: TestDb;
let db: Db;

before(async () => {
  testDb = await createTestDb(requireEnv('DATABASE_URL'));
  db = connectDb(testDb.url);
});

after(async () => {
  // Disconnect first, then drop: a database someone is connected to cannot be dropped
  await db?.$client.end();
  await testDb?.drop();
});

/** Whether the server has a database of this name */
async function databaseExists(url: string): Promise<boolean> {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  const rows = await db.execute(sql`select 1 from pg_database where datname = ${name}`);
  return rows.length === 1;
}

test('the time zone of a connection is the UTC we set, whatever the database server is set to', async () => {
  // Some time columns carry no time zone; a time the database fills in is written in the session's time zone and
  // always read back as UTC, so the session's time zone has to be UTC.
  // A server whose time zone was never set reports another name (Etc/UTC, say), so this tells "we set it" from
  // "it happened to be".
  const [row] = await db.execute(sql`select current_setting('TimeZone') as zone`);

  assert.equal(row?.zone, 'UTC');
});

test('every test database stands alone: its tables are there, what is written in one is not in another, and a dropped one is gone', async () => {
  const other = await createTestDb(requireEnv('DATABASE_URL'));
  const otherDb = connectDb(other.url);

  try {
    assert.notEqual(other.url, testDb.url);

    await otherDb.insert(users).values({ name: 'Ada', email: 'ada@example.com' });

    assert.equal((await otherDb.select().from(users)).length, 1);
    assert.equal((await db.select().from(users)).length, 0);
  } finally {
    await otherDb.$client.end();
    await other.drop();
  }

  assert.equal(await databaseExists(other.url), false);
  assert.equal(await databaseExists(testDb.url), true);
});

test('several processes applying the migrations at once: all succeed, and each migration is applied once', async () => {
  // Two servers started almost together each apply the migrations as they start.
  // The database starts empty, so no migration has been applied and everyone arriving wants to apply them all
  const empty = await createTestDb(requireEnv('DATABASE_URL'));
  const emptyDb = connectDb(empty.url);

  try {
    await emptyDb.transaction(async (tx) => {
      // The database lists every table the drop takes along, one notice each; not wanted here
      await tx.execute(sql`set local client_min_messages = warning`);
      await tx.execute(sql`drop schema public cascade`);
      await tx.execute(sql`create schema public`);
      await tx.execute(sql`drop schema drizzle cascade`);
    });

    await Promise.all([migrateDb(empty.url), migrateDb(empty.url), migrateDb(empty.url), migrateDb(empty.url)]);

    const [applied] = await emptyDb.execute(sql`select count(*)::int as count from drizzle.__drizzle_migrations`);
    const [expected] = await db.execute(sql`select count(*)::int as count from drizzle.__drizzle_migrations`);
    assert.ok(Number(expected?.count) > 0);
    assert.equal(applied?.count, expected?.count, 'as many migrations should be recorded as when they run once');
    // The tables are there
    assert.equal((await emptyDb.select().from(users)).length, 0);
  } finally {
    await emptyDb.$client.end();
    await empty.drop();
  }
});

test('a statement that runs past the limit fails, and the connection goes on to serve the next one', async () => {
  const limited = connectDb(testDb.url, { queryTimeoutSeconds: 1 });

  try {
    // The database ends the statement itself; the error it gives is wrapped by the query layer
    await assert.rejects(limited.execute(sql`select pg_sleep(5)`), (error: Error) => {
      assert.match(String(error.cause), /statement timeout/);
      return true;
    });

    const [row] = await limited.execute(sql`select 1 as one`);
    assert.equal(row?.one, 1);
  } finally {
    await limited.$client.end();
  }
});
