import { defineConfig } from 'drizzle-kit';

// drizzle-kit is used for one thing: writing migration files. It compares the tables defined in src/schema with the
// snapshot of the last migration and writes the SQL for the difference, without connecting to a database.
// Applying migrations to a database is src/migrate.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema',
  out: './migrations'
});
