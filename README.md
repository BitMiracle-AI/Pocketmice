# Pocketmice

**A cloud drive that people and AI agents share.** People use it the way they use any cloud drive. Agents work on
the same files: they read what people give them and hand back what they make.

> **Status: early.** The server side of the drive works: signing up and signing in, spaces with their members and
> invites, API keys for agents, and files — folders, upload and download, versions, a trash. There is no web app,
> no SDK and no MCP server yet: the way in is the HTTP API, and for an agent the [skill](#agent-skill) that teaches
> it. Nothing here is ready for production.

## What is planned

- A web app for people: upload, organise and share files.
- Spaces. A space is a set of files together with the people who can get in, and someone can be in many spaces.
  A member is a viewer, an editor or the owner, and people get in with an invite link.
- Three ways in for agents: an HTTP API with a TypeScript SDK, an MCP server, and an agent skill. An agent calls the
  same API as a person, with an API key that person made. What it does is done as that person; a key can be
  read-only, and no key decides who gets into a space.
- A server you can run yourself, on Postgres, with the files in a folder on its disk or in an S3-compatible bucket.

## What it promises about files

- **Nothing is written over unseen.** To write over a file, the caller names the version it is replacing. If
  somebody else wrote in between, the write is refused with `CONFLICT`.
- **What an agent does can be undone.** Every write is a new version and the versions before it stay; deleting
  puts a file in the trash. Deleting for good, emptying the trash and deleting a space are for the owner of the
  space, signed in themselves: no API key does them.
- **Who wrote what is on record.** Every version says who wrote it, and through which API key when an agent did.

## Repository layout

```
apps/api            the API server (Hono on Node)
apps/app            the web app (Vite and React). It has its UI components and no page yet
packages/contract   the definition of every operation: its input, its output, its error codes
packages/client     the code every caller shares to call the API
packages/db         the database: tables, connection and migrations (Drizzle on Postgres)
skills/pocketmice   the agent skill: one file that teaches an agent with a shell to use the drive
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

The content of files does not go through operations, whose inputs and outputs are JSON. It goes through one
address, `/api/content`, with the same checks on who is calling:

```sh
# Upload a new file, directly into the space (add parentId=<folder> for a folder). Answers with the file
curl -T report.md 'http://localhost:11210/api/content?spaceId=<space>&name=report.md' \
  -H 'authorization: Bearer pm_...'

# Download it. The etag of the answer is the id of the version that was sent
curl -o report.md 'http://localhost:11210/api/content?spaceId=<space>&fileId=<file>' \
  -H 'authorization: Bearer pm_...'

# Write over it, naming the version being replaced: CONFLICT if it is no longer the current one
curl -T report.md 'http://localhost:11210/api/content?spaceId=<space>&fileId=<file>&baseVersionId=<version>' \
  -H 'authorization: Bearer pm_...'
```

A file is at most 1 GB.

The API listens on its own machine only, so a reverse proxy goes in front of it. The API counts on the proxy for
three things:

- The limit on the size of a request body is raised to 1 GB (nginx allows 1 MB unless told otherwise).
- `X-Forwarded-For` is set to the address each request came from, in place of whatever the client sent: the limit
  on sign-in attempts counts by it.
- A connection that goes silent is ended (nginx does so by itself, after a minute). The API gives an upload as
  long as its bytes take to arrive, and ends nothing for being slow.

Tried behind nginx, both holding a request body until all of it has arrived (its default) and passing it on as it
comes.

## Agent skill

An agent that has a shell learns the drive from one file, [`skills/pocketmice/SKILL.md`](skills/pocketmice/SKILL.md):
a skill in the open [Agent Skills](https://agentskills.io) format.

```sh
npx skills add BitMiracle-AI/Pocketmice
```

It teaches the agent to find, download, upload and write over files with curl, to organise folders, to read the
versions of a file and bring one back, and what an API key cannot do. The agent is given two environment variables:
`POCKETMICE_URL`, the address of the server, and `POCKETMICE_API_KEY`, a key made by the person it works for.

The skill lists every operation an API key may call, and `pnpm check` fails when that list and `packages/contract`
disagree.

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
cp apps/api/.env.example apps/api/.env    # fill in DATABASE_URL and BETTER_AUTH_SECRET; files go to ./data/storage
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
