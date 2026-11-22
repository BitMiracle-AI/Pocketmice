// Command-line entry: applies the migrations that have not run yet to the database DATABASE_URL points at. A
// deployed server runs it before it starts the api.
// The address of the database is the api's configuration, so the command lives here; packages/db is only code and
// does not read the environment.
import { migrateDb } from '@pocketmice/db/migrate';
import { requireEnv } from './env.ts';

await migrateDb(requireEnv('DATABASE_URL'));
console.log('Migrations applied');
