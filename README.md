# Pocketmice

**A cloud drive that people and AI agents share.** People use it the way they use any cloud drive. Agents work on
the same files: they read what people give them and hand back what they make.

> **Status: just started.** What exists is the foundation and the first pieces on it: signing up and signing in,
> profiles, spaces with their members, invites, and API keys for agents. There are no files yet, and nothing here
> is usable.

## What is planned

- A web app for people: upload, organise and share files.
- Spaces. A space is a set of files together with the people who can get in, and someone can be in many spaces.
  A member is a viewer, an editor or the owner, and people get in with an invite link.
- Three ways in for agents: an HTTP API with a TypeScript SDK, an MCP server, and an agent skill. An agent calls the
  same API as a person, with an API key that person made. What it does is done as that person; a key can be
  read-only, and no key decides who gets into a space.
- A server you can run yourself, on Postgres.

## Repository layout

```
apps/api            the API server (Hono on Node)
packages/contract   the definition of every operation: its input, its output, its error codes
packages/client     the code every caller shares to call the API
packages/db         the database: tables, connection and migrations (Drizzle on Postgres)
scripts/            checks of the repository's structure, run by `pnpm check`
```

## How the API is built

Every operation is a `POST` to `/api/<name>`, and its name is a verb followed by a noun: `getSpaces`. An operation
is written down once, in `packages/contract`:

```ts
export const getMembers = operation({
  name: 'getMembers',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id }),
  output: z.object({ members: z.array(member) }),
  errors: []
});
```

The definition also says who may call the operation. The server checks all of it in one place, before the
implementation runs:

- `kind` is a read or a write, and a read is what a name starting with `get` is. A read-only API key calls reads
  only.
- `access` is `public` for anyone, `authenticated` for a person (signed in, or through one of their API keys), and
  `session` for the person themselves, never an API key.
- `belongsTo` says whether it works inside a space. If it does, the caller must be a member of that space, in the
  role `minRole` or a higher one.

The server implements an operation from its definition with `implement()`, and callers call it from the same
definition with `@pocketmice/client`, so the input, the output and the error codes are typed on both sides and
cannot drift apart. A call never throws: it returns the output, or an error code.

```ts
const call = createApiClient({ baseUrl: 'http://localhost:11210', fetch, reportError: console.error });

const result = await call(getServerInfo, {});
if (result.ok) console.log(result.data.version);
```

A failure is the real HTTP status with one error body, `{ "error": { "code": "...", "message": "..." } }`. Callers
decide what to do by the code; the message is for logs and developers.

An agent sends its API key with every request, as a bearer token:

```sh
curl -X POST http://localhost:11210/api/getSpaces \
  -H 'authorization: Bearer pm_...' -H 'content-type: application/json' -d '{}'
```

## Development

You need Node 26 or later, pnpm 11 and a Postgres server.

Create a role and a database for Pocketmice. The role needs the right to create databases, for the tests: every
test file creates a temporary database of its own and drops it when done.

```sql
create role pocketmice login createdb password '<password>';
create database pocketmice owner pocketmice;
```

Then:

```sh
pnpm install
cp apps/api/.env.example apps/api/.env    # fill in DATABASE_URL and BETTER_AUTH_SECRET
pnpm --filter @pocketmice/api migrate
pnpm dev
```

The API listens on `http://localhost:11210`:

```sh
curl -X POST http://localhost:11210/api/getServerInfo -H 'content-type: application/json' -d '{}'
```

Before committing, `pnpm check` must pass: formatting, lint, the structure checks and the type check. `pnpm check:all`
adds every test.

## License

[Apache-2.0](LICENSE)
