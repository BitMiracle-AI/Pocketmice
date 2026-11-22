import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { SESSION_SETTINGS } from './client.ts';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

/**
 * The number of the lock taken in the database while migrations run. An arbitrary number; all that matters is that
 * nothing else uses it. Each database has its own lock, so different databases do not wait for each other.
 */
const MIGRATION_LOCK = 4418207365519032;

/**
 * Applies the migrations in migrations/ that this database has not had yet; the ones it has had are skipped.
 * Several processes may call it for the same database at once: one applies at a time, the others wait for it and
 * then find everything applied.
 */
export async function migrateDb(url: string): Promise<void> {
  // onnotice is emptied: the migration tool creates its own bookkeeping table "if not exists" every time, and the
  // database sends a notice when it exists, which says nothing.
  // max: 1: one connection only. The lock below belongs to a connection, so taking it and applying the migrations
  // have to happen on the same one.
  const db = drizzle({ connection: { url, max: 1, onnotice: () => {}, connection: SESSION_SETTINGS } });
  try {
    // The migration tool does not guard against running twice at once: it reads how far the database has got, then
    // applies what comes after, with no lock between the two steps. A server applies migrations when it starts, and
    // two new servers started almost together would apply the same migration twice.
    // So a lock is taken in the database first, and whoever does not get it waits. It is not released by hand: the
    // database releases it when the connection ends (the end below, or the process dying half way).
    await db.execute(sql`select pg_advisory_lock(${MIGRATION_LOCK})`);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await db.$client.end();
  }
}
