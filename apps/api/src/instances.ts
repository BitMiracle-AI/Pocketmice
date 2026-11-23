// The set a running server uses: the database connection, the storage and the sign-in. Their configuration is read from the
// environment, and the process has one of each.
// Code that needs them is given them by main.ts and does not read the environment again. Tests do not import this
// file: a test builds its own set.
// The command-line tool of the sign-in library reads this file too. It takes the export named auth and generates
// packages/db/src/schema/auth.ts from it.
import { connectDb } from '@pocketmice/db';
import { createAuth } from './domains/auth/auth.ts';
import { prepareSignIn } from './domains/prepareSignIn.ts';
import { requireEnv, requireOrigins, storageFromEnv } from './env.ts';
import { logInternalError } from './http/errorLog.ts';
import { createFolderStorage } from './storage/folderStorage.ts';
import { createS3Storage } from './storage/s3Storage.ts';

/**
 * A statement waits at most this many seconds, then fails. Without a limit, a statement on a connection that has
 * gone silent (the primary was switched, a device in between dropped the connection without a word) neither ends
 * nor fails, and the request waiting for it just stops. An ordinary statement takes milliseconds. Migrations use a
 * connection of their own, which this does not govern.
 */
const DB_STATEMENT_SECONDS = 30;

/** The pool of database connections. The sign-in library and the operations share it */
export const db = connectDb(requireEnv('DATABASE_URL'), { queryTimeoutSeconds: DB_STATEMENT_SECONDS });

const storageConfig = storageFromEnv();

/** Where the bytes of files are kept: the folder or the bucket the environment names */
export const storage =
  storageConfig.kind === 'folder' ? createFolderStorage(storageConfig.dir) : createS3Storage(storageConfig);

/** The web pages allowed to call the api. The sign-in library and the cross-origin settings use this one list */
export const webOrigins = requireOrigins('WEB_ORIGINS');

/** The sign-in */
export const auth = createAuth({
  db,
  secret: requireEnv('BETTER_AUTH_SECRET'),
  apiUrl: requireEnv('API_URL'),
  webOrigins,
  prepareSignIn: (userId) => prepareSignIn(db, userId),
  reportError: logInternalError
});
