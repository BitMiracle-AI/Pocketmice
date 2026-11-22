import { drizzle } from 'drizzle-orm/postgres-js';

/**
 * The session parameters set on every connection as soon as it is made: the time zone is fixed to UTC.
 * Some of our time columns carry no time zone. A time the database fills in itself (defaultNow() in a table
 * definition) is written in the time zone of the session, and is always read back as UTC. Left to the server, moving
 * to a database server set to another time zone would shift those times by hours, with no error.
 */
export const SESSION_SETTINGS = { TimeZone: 'UTC' };

/** Optional settings of a connection */
export interface ConnectOptions {
  /**
   * How many seconds one statement may run. Two places enforce it, each for one case:
   * - The database is fine and the statement is slow (waiting for a lock, say): the database ends it when the time
   *   is up (the session parameter statement_timeout). The statement fails, its connection stays in use, and nothing
   *   is left running in the database.
   * - The database does not answer (the connection is open and nothing comes back): it cannot end the statement
   *   itself. The client library waits SILENT_SERVER_SECONDS longer and then gives up, and the statement fails; if
   *   another 5 seconds bring nothing, it closes the connection and later statements get a new one.
   * Not set, a statement waits for ever: one on a connection that has gone silent neither ends nor fails, and
   * neither do the statements queued behind it.
   *
   * The client library alone is not enough. When its time is up it sends the database a "cancel", and some hosted
   * databases do not forward a cancel through their address: the statement keeps running in the database, the
   * library can only close the connection, and every retry leaves one more statement running. The two limits must
   * not be equal either: the library's cancel would always arrive a moment late and cancel the next statement on
   * that connection instead.
   */
  queryTimeoutSeconds?: number;
}

/** How long after the database should have ended a statement the client library stops waiting for it, in seconds */
const SILENT_SERVER_SECONDS = 2;

/**
 * Connects to the database at this address. When done, call db.$client.end() to disconnect: until then the process
 * does not exit.
 */
export function connectDb(url: string, options: ConnectOptions = {}) {
  const seconds = options.queryTimeoutSeconds;
  return drizzle({
    connection: {
      url,
      connection:
        // statement_timeout is in milliseconds
        seconds === undefined ? SESSION_SETTINGS : { ...SESSION_SETTINGS, statement_timeout: seconds * 1000 },
      ...(seconds === undefined ? {} : { query_timeout: seconds + SILENT_SERVER_SECONDS })
    }
  });
}

export type Db = ReturnType<typeof connectDb>;

/** The database object inside a transaction: the one db.transaction hands to its callback */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
