# Pocketmice

**A cloud drive that people and AI agents share.** People use it the way they use any cloud drive. Agents work on
the same files: they read what people give them and hand back what they make.

> **Status: early.** The server side of the drive works: signing up and signing in, spaces with their members and
> invites, API keys for agents, and files — folders, upload and download, versions, a trash. There is no web app
> yet: the way in is the HTTP API, for a program the [TypeScript SDK](#typescript-sdk), which is in this repository
> and not on npm yet, and for an agent the [MCP server](#mcp-server) or the [skill](#agent-skill) that teaches it
> the API. Nothing here is ready for production.

## What is planned

- A web app for people: upload, organise and share files.
- Spaces. A space is a set of files together with the people who can get in, and someone can be in many spaces.
  A member is a viewer, an editor or the owner, and people get in with an invite link.
- Three ways in for agents: an HTTP API with a TypeScript SDK, an MCP server, and an agent skill. An agent calls the
  same API as a person, with an API key that person made. What it does is done as that person; a key can be
  read-only, and no key decides who gets into a space.
- A server you can run yourself, on Postgres, with the files in a folder on its disk or in an S3-compatible bucket.
  People sign in with an email address and a password; a server that is given an SMTP server to send mail through
  signs them in with a code sent to their address instead.

## What it promises about files

- **Nothing is written over unseen.** To write over a file, the caller names the version it is replacing. If
  somebody else wrote in between, the write is refused with `CONFLICT`.
- **What an agent does to the content of a file can be undone.** Every write is a new version and the versions
  before it stay; deleting puts a file in the trash. Deleting for good, emptying the trash and deleting a space
  are for the owner of the space, signed in themselves: no API key does them. What a file is called, how it is
  described and which folder it is in have no history: a new one takes the place of the old.
- **Who wrote what is on record.** Every version says who wrote it, and through which API key when an agent did.

## Repository layout

```
apps/api            the API server (Hono on Node)
apps/app            the web app (Vite and React). It has its UI components and no page yet
packages/contract   the definition of every operation: its input, its output, its error codes
packages/client     the code every caller shares to call the API
packages/sdk        the TypeScript SDK: the drive, for a program that holds an API key
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
  description: 'The members of a space, in the order they became members, each with their role there.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id }),
  output: z.object({ members: z.array(member) }),
  errors: []
});
```

`description` says what the operation does, in sentences a caller can act on: it is the one place that says so.

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

A reverse proxy goes in front of the API, which by itself listens on its own machine only. The API counts on the
proxy for three things:

- The limit on the size of a request body is raised to 1 GB (nginx allows 1 MB unless told otherwise).
- `X-Forwarded-For` is set to the address each request came from, in place of whatever the client sent: the limits
  on sign-in attempts and on sign-in codes count by it. In nginx that is
  `proxy_set_header X-Forwarded-For $remote_addr;`, and nginx sends no such header unless told. Traefik sets it by
  itself, unless it is told to trust the headers of its clients. Without it everyone shares one count, and thirty
  wrong passwords a minute from anyone keep everybody from signing in.
- A connection that goes silent is ended (nginx does so by itself, after a minute). The API itself ends a request
  only when it has taken three hours, which is 1 GB over a slow line. Traefik by its own default gives a whole
  request, body included, one minute: lift that limit (`respondingTimeouts.readTimeout` of the entry point), or an
  upload that takes longer is cut off.

Tried behind nginx, both holding a request body until all of it has arrived (its default) and passing it on as it
comes. Tried behind Traefik 3.6 with that limit lifted: an upload that took 78 seconds and one of 300 MB arrived
whole, and a client that named an `X-Forwarded-For` of its own was still counted by its real address.

## Running the API in a container

`apps/api/Dockerfile` builds an image of the API. The build context is the root of the repository:

```sh
docker build -f apps/api/Dockerfile -t pocketmice-api .
```

A container applies the migrations that have not run yet and then starts the API on port 11210, on every address
the container has. It takes its configuration from the environment, with the variables of
[`apps/api/.env.example`](apps/api/.env.example). When the files are kept in a folder, mount a volume at `/data`
and set `STORAGE_DIR=/data/storage`: without a volume the files are gone with the container.

Keep the database, and every backup of it, the way you keep a credential. It holds each API key as it is, not a
hash of it: that is how the person who made a key copies it again whenever they are signed in. So whoever can read
the database can call the API as every person who has a key.

## TypeScript SDK

A program that holds an API key uses the drive through `packages/sdk`. It is not on npm yet: for now it is used
from inside this repository.

```ts
import { createPocketmice, PocketmiceError } from '@pocketmice/sdk';

const drive = createPocketmice({ url: 'http://localhost:11210', apiKey: 'pm_...' });

const { space } = await drive.createSpace({ name: 'Research' });
const spaceId = space.id;

const { file } = await drive.uploadFile({ spaceId, parentId: null, name: 'report.md', content: '# Report' });

const download = await drive.downloadFile({ spaceId, fileId: file.id });
const text = await download.text();

try {
  // Names the version the new content was made from: CONFLICT if somebody wrote to the file in between
  const baseVersionId = download.versionId;
  await drive.uploadFileVersion({ spaceId, fileId: file.id, baseVersionId, content: `${text}\nMore.` });
} catch (error) {
  if (error instanceof PocketmiceError && error.code === 'CONFLICT') {
    // Download it again, then decide
  }
}
```

- Every operation an API key may call is a method of the same name, taking the operation's input and returning its
  output. The methods are made from the definitions in `packages/contract`, not written a second time. What only
  the person does, like making a key or deleting for good, is not there.
- The content of files has three methods: `uploadFile`, `uploadFileVersion` and `downloadFile`. Content is text,
  bytes or a `Blob`, and not a stream: the server takes no upload without a length. For a file on disk, Node has
  `openAsBlob`.
- A method that fails throws a `PocketmiceError`, and nothing else. Decide what to do by its `code`, which is the
  error code the server answered with, or `UNREACHABLE` when the server was not reached.
- A method is one request. Writing to a path whose folders may be missing takes several: the
  [skill](#agent-skill) says which.
- It uses no module of Node, so it should run wherever there is a `fetch`. It has been tried on Node only.

## MCP server

An agent whose host speaks the [Model Context Protocol](https://modelcontextprotocol.io) connects to one address
of the API, `/api/mcp`, with an API key as a bearer token. In Claude Code:

```sh
claude mcp add --transport http pocketmice https://api.example.com/api/mcp \
  --header "Authorization: Bearer pm_..."
```

Every operation that is done as the person a key belongs to is a tool (its `access` is `authenticated`), under
the operation's own name, with the description and the input its definition has. Three more tools read and write
the content of files as text: `getFileContent`, `createFile` and `updateFileContent`. A long text is read a piece
at a time, and writing over a file names the version being replaced, as everywhere else.

A tool does what the same key does over HTTP, and nothing else: it sends a request to the API as the caller, and
what the API refuses comes back as the error code and its message. So a read-only key reads, and a viewer changes
nothing. Two kinds of operation are not tools at all: what no API key does (deciding who gets in, deleting for
good), and what anyone may call without being anybody (asking which server this is, asking for a sign-in code).

What it does not do yet:

- Content that is not text, and anything too large to pass through a model, goes through `/api/content`.
- It takes an API key and has no OAuth. Hosts that connect with OAuth only, like the chat apps of Claude and
  ChatGPT, cannot connect yet. Tried with Claude Code.

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

### The first steps, by hand

There is no web app yet, so what a person does in it is done with curl for now: signing up, and making the API key
an agent calls with. With `.env` as copied from the example, people sign in with a password. Signing up signs you
in, and the cookie that says so goes into `cookies.txt`:

```sh
curl -c cookies.txt -X POST http://localhost:11210/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"name":"Ada","email":"ada@example.com","password":"correct horse battery"}'
```

Making a key is for the person, signed in themselves, so it is sent with the cookie:

```sh
curl -b cookies.txt -X POST http://localhost:11210/api/createApiKey \
  -H 'content-type: application/json' -d '{"name":"my agent","permission":"write"}'
# {"apiKey":{"id":"…","name":"my agent","permission":"write","key":"pm_…","createdAt":"…"}}
```

From here on the key is enough, for you and for an agent. Make a space:

```sh
curl -X POST http://localhost:11210/api/createSpace \
  -H 'authorization: Bearer pm_...' -H 'content-type: application/json' -d '{"name":"Research"}'
# {"space":{"id":"…","name":"Research","role":"owner"}}
```

With the id of the space, the uploads and the download under [How the API is built](#how-the-api-is-built) work
as they are written there, and the SDK, the MCP server and the skill have what they need: the address and the key.

`cookies.txt` is you, signed in: keep it the way you keep a password. To sign in again later, send the email
address and the password to `/api/auth/sign-in/email`. With `MAIL_TO_CONSOLE=true` in `.env` the server signs
people in with a code and has no passwords: in place of signing up, ask for a code with `requestSignInCode`
(`{"email":"…"}`), read it in the output of the api, and send `{"email":"…","otp":"<the code>"}` to
`/api/auth/sign-in/email-otp`.

Before committing, `pnpm check` must pass: formatting, lint, the structure checks and the type check. `pnpm check:all`
adds every test.

## Contributing and security

Issues are welcome. Pull requests from outside the maintaining team are not taken:
[CONTRIBUTING.md](CONTRIBUTING.md) says why, and what to do in their place. A security problem is reported in
private, as [SECURITY.md](SECURITY.md) says.

## License

[Apache-2.0](LICENSE)
