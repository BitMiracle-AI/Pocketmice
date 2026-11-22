import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { migrateDb } from './migrate.ts';

/**
 * A test database left behind is dropped once it is this old: far longer than any test run takes, so one that is
 * still in use is never dropped.
 */
const STALE_AFTER_MS = 60 * 60 * 1000;
/** Postgres allows a database name 63 bytes; a longer one is cut short without a word */
const MAX_NAME_LENGTH = 63;
/** The database's error code for: someone is still connected to this database, so it cannot be dropped */
const DATABASE_IN_USE = '55006';

export interface TestDb {
  /** The address of this database */
  url: string;
  /**
   * Drops this database. Disconnect from it first: a database someone is connected to cannot be dropped.
   */
  drop: () => Promise<void>;
}

/**
 * Creates a temporary database for the caller alone, with the migrations applied. Each test file creates one and
 * drops it when done.
 * It lives on the same server as the development database databaseUrl points at, so tests, and several test runs at
 * once, never see each other's data and never touch the development database.
 * Each call first drops the databases that earlier runs left behind when they were killed.
 */
export async function createTestDb(databaseUrl: string): Promise<TestDb> {
  const url = new URL(databaseUrl);
  const prefix = `${decodeURIComponent(url.pathname.slice(1))}_test_`;
  const name = testDbName(prefix, new Date());
  if (Buffer.byteLength(name) > MAX_NAME_LENGTH) {
    throw new Error(`Test database name ${name} is longer than ${MAX_NAME_LENGTH} bytes. Use a shorter database name.`);
  }
  url.pathname = `/${name}`;

  /**
   * Connects to the development database to send one command that creates or drops a database. The connection is
   * only borrowed for the command: nothing in the development database is read or written.
   */
  async function onServer(run: (sql: postgres.Sql) => Promise<unknown>): Promise<void> {
    const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
    try {
      await run(sql);
    } finally {
      await sql.end();
    }
  }

  async function drop(): Promise<void> {
    await onServer((sql) => sql`drop database if exists ${sql(name)}`);
  }

  try {
    await onServer(async (sql) => {
      await dropStaleTestDbs(sql, prefix);
      await sql`create database ${sql(name)}`;
    });
  } catch (cause) {
    throw new Error(
      `Could not create test database ${name}. See apps/api/.env.example for the database setup that tests need.`,
      { cause }
    );
  }

  try {
    await migrateDb(url.href);
  } catch (error) {
    await drop();
    throw error;
  }

  return { url: url.href, drop };
}

/**
 * The name of a test database: the prefix, the time it was created (year to second in UTC, 14 digits), an
 * underscore, and 8 random characters.
 * The time is in the name because the database does not record when a database was created, and cleaning up the
 * ones left behind has to go by something.
 */
export function testDbName(prefix: string, createdAt: Date): string {
  const time = createdAt.toISOString().replace(/\D/g, '').slice(0, 14);
  return `${prefix}${time}_${randomBytes(4).toString('hex')}`;
}

/**
 * Which of names are test databases left behind: named the way testDbName names them, and created over an hour ago.
 * A name that does not fit the pattern never counts.
 */
export function staleTestDbNames(names: string[], prefix: string, now: Date): string[] {
  return names.filter((name) => {
    if (!name.startsWith(prefix)) return false;

    const match = name.slice(prefix.length).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_[0-9a-f]{8}$/);
    if (!match) return false;

    const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
    const createdAt = Date.UTC(year ?? 0, (month ?? 1) - 1, day, hour, minute, second);
    return now.getTime() - createdAt > STALE_AFTER_MS;
  });
}

/**
 * Drops the test databases left behind: a test run that is killed has no chance to drop the one it created.
 */
async function dropStaleTestDbs(sql: postgres.Sql, prefix: string): Promise<void> {
  // Only databases nobody is connected to are looked at. One with a connection is in use after all and is left
  // alone; and trying to drop one makes the database wait 5 seconds before it reports the failure, which would slow
  // down every test database created meanwhile.
  const rows = await sql<{ datname: string }[]>`
    select datname from pg_database
    where datname not in (select datname from pg_stat_activity where datname is not null)
  `;
  const stale = staleTestDbNames(
    rows.map((row) => row.datname),
    prefix,
    new Date()
  );

  for (const name of stale) {
    try {
      await sql`drop database if exists ${sql(name)}`;
    } catch (error) {
      // Someone connected to it right after the look: left alone as well. Any other error is reported as usual
      if (!(error instanceof postgres.PostgresError) || error.code !== DATABASE_IN_USE) throw error;
    }
  }
}
