<p align="center">
  <img src="apps/app/public/favicon.svg" width="96" height="96" alt="A pocket mouse looking out of a folder">
</p>

<h1 align="center">Pocketmice</h1>

<p align="center"><strong>A cloud drive that people and AI agents share.</strong></p>

People use it the way they use any cloud drive. Agents work on the same files: they read what people give them and
hand back what they make.

> **Status: early.** The server side of the drive works: signing up and signing in, spaces with their members and
> invites, API keys for agents, and files — folders, upload and download, versions, a trash, and limits on how much
> a space and each member may hold; and conversations, where the people and the agents of a space talk, with a
> channel that tells a caller what happens as it happens. The web app has pages for it: signing in, the spaces
> you are in, each with its members and invite links, the files of a space (folders, upload, download, renaming,
> moving, looking for a file by words, the trash, the versions of a file), its conversations, shown as they are
> said, renaming and deleting a space, how much a space and each member holds and the limits its owner sets, the
> name you go by, API keys, and how to connect an agent. For a program there is the
> [TypeScript SDK](#typescript-sdk), which is in this repository and not on npm yet, and for an agent the
> [MCP server](#mcp-server) or the [skill](#agent-skill) that teaches it the API. Nothing here is ready for
> production.

## What is planned

- A web app for people: upload, organise and share files.
- Spaces. A space is a set of files together with the people who can get in, and someone can be in many spaces.
  A member is a viewer, an editor or the owner, and people get in with an invite link.
- Three ways in for agents: an HTTP API with a TypeScript SDK, an MCP server, and an agent skill. An agent calls the
  same API as a person, with an API key that person made. What it does is done as that person; a key can be
  read-only, and no key decides who gets into a space.
- A server you can run yourself, on Postgres, with the files in an S3-compatible bucket.
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

## Conversations

A space has conversations: where its members talk, people and the agents that act for them alike. They are how a
person tells an agent what to do next to the files it is about, and how the agent says what it did.

- A conversation is about one matter: it has a title, and members of its own, who are members of the space. Its
  members read it, and so does the owner of the space, who reads every conversation in it. Any member of a space
  starts one and talks, a viewer too. Who is in a conversation is decided by a person, signed in: no API key adds
  or removes anyone.
- A message is plain text. It says who sent it, and through which API key when an agent did: an agent speaks as
  the person its key belongs to, and what it said is told apart from what they typed. A message can mention
  members of the conversation and point at files of the space.
- The messages of a conversation are numbered from 1 and read by number: `getMessages` answers with the ones
  after a number. A message is never changed; whoever sent it, or the owner of the space, can delete it.
- **Events.** `GET /api/events?spaceId=…` is answered with a line for each thing that happens in a space, for as
  long as the channel stays open (`text/event-stream`). An event says that something changed, like "this
  conversation has reached message 12", and never what was said: the caller reads that through the API. A page
  shows a message the moment it is sent this way, and a program with an API key answers when it is spoken to and
  not when it next looks. The server passes events between its processes through Postgres, and needs nothing
  else for it.

In the web app a space has its conversations in the sidebar: the ones you are in, with how many messages you have
not read, and for the owner every conversation of the space. What an agent sent is shown under the name of its API
key and of the person it spoke as.

What it does not do yet: an agent connected over MCP has no channel, and looks when it is asked to; nothing is
pushed to an address of yours (no webhooks); a message cannot be changed once it is sent, and there is no looking
for a message by words.

## Repository layout

```
apps/api            the API server (Hono on Node)
apps/app            the web app (Vite and React): signing in, spaces and their members, files, conversations, the account and API keys
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
export const getFileByPath = operation({
  name: 'getFileByPath',
  description:
    'One file or folder, by its path: the names from the top of the space down to it, like ' +
    '/Reports/2026/summary.md. NOT_FOUND: there is nothing at the path.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id, path: filePath }),
  output: z.object({ file }),
  errors: ['NOT_FOUND']
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

The content of files does not go through operations, whose inputs and outputs are JSON. It is uploaded to one
address, `/api/fileContent`, with the same checks on who is calling:

```sh
# Upload a new file, directly into the space (add parentId=<folder> for a folder). Answers with the file
curl -T report.md 'http://localhost:11210/api/fileContent?spaceId=<space>&name=report.md' \
  -H 'authorization: Bearer pm_...'

# Write over it, naming the version being replaced: CONFLICT if it is no longer the current one
curl -T report.md 'http://localhost:11210/api/fileContent?spaceId=<space>&fileId=<file>&baseVersionId=<version>' \
  -H 'authorization: Bearer pm_...'
```

A download does not pass through the API. The operation `getFileDownloadUrl` answers with an address of the bucket
the files are kept in, signed by the API and good for five minutes, and with the version the bytes are; the caller
fetches the bytes there, without its key:

```sh
# Where the content of the file is now (name a version in place of null for an older one)
curl -X POST http://localhost:11210/api/getFileDownloadUrl \
  -H 'authorization: Bearer pm_...' -H 'content-type: application/json' \
  -d '{"spaceId":"<space>","fileId":"<file>","versionId":null}'
# {"url":"https://...","version":{"id":"...","size":1234,"sha256":"...", ...}}

curl -f -o report.md '<url>'
```

Who may read the file is decided when the address is made: until its five minutes are up, whoever holds it can
fetch the bytes. It always answers with a file to save, never with a page a browser would show.

A file is at most 1 GB.

The owner of a space can limit how much the space holds (`updateSpaceStorageLimit`), and how much each member
holds in it (`updateMemberStorageLimit`; an invite gives a limit to whoever joins with it). Everything that is
kept counts: every version of every file, the versions before the current one and what is in the trash too. What
an agent writes counts as its person's, so a limit on a member holds that member's agents. An upload that would
pass a limit is refused before its bytes are taken, with `SPACE_STORAGE_LIMIT_EXCEEDED` or
`MEMBER_STORAGE_LIMIT_EXCEEDED`; `getSpaceSize` and `getMembers` say how much is held. Only the owner sets a
limit, signed in themselves, and only the owner makes room, by deleting for good: no API key does either. A space
that was given no limit has none. A limit is not exact: uploads that are under way at the same time do not count
each other, and together can go past it by as much as they add. And a limit holds one space, not the server:
whoever can sign in makes spaces of their own, which have no limit, so limits do not say how much the server
holds in all.

Where the bytes are is asked of `getFileSize`: how much one folder holds with everything in it, or one file with
every version of it. What is in the trash is not counted there, though the space still keeps it. The number is
added up when it is asked for, so it is not in the lists of files, and it takes longer the more files a folder
has.

In the web app the owner sets the limit of a space in its settings, the limit of a member from that member's row
on the page of the members, and the limit an invite link gives when the link is made. Every member sees there how
much the space holds, and how much each member does, and among the files how much a folder that is picked holds.

A reverse proxy goes in front of the API, which by itself listens on its own machine only. The API counts on the
proxy for four things:

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
- A connection to the API that carries no request is closed by the proxy, and not by the API, which keeps one for
  two hours. nginx (after a minute), Traefik (90 seconds), Caddy (two minutes) and Envoy (an hour) do so by
  themselves. A proxy told to keep them longer than two hours now and then sends a request down a connection the
  API is just closing, and answers 502 for it.

Tried behind nginx, both holding a request body until all of it has arrived (its default) and passing it on as it
comes; and with nginx keeping its connections to the API, where requests timed to the moment an idle one is closed
were all answered. Tried behind Traefik 3.6 with that limit lifted: an upload that took 78 seconds and one of 300
MB arrived whole, and a client that named an `X-Forwarded-For` of its own was still counted by its real address.

An upload that cannot be taken (the name is in use, a storage limit would be passed) is refused before its bytes
are read. Behind a proxy that holds the body until all of it has arrived, the caller still sends all of it first:
24 MB at 2 MB a second waited 12 seconds for its refusal behind nginx as it comes, and none with
`proxy_request_buffering off`.

## Running the API in a container

`apps/api/Dockerfile` builds an image of the API. The build context is the root of the repository:

```sh
docker build -f apps/api/Dockerfile -t pocketmice-api .
```

A container applies the migrations that have not run yet and then starts the API on port 11210, on every address
the container has. It takes its configuration from the environment, with the variables of
[`apps/api/.env.example`](apps/api/.env.example). It keeps nothing on its own disk: what the files are is in the
database, and their content is in the bucket.

Keep the database, and every backup of it, the way you keep a credential. It holds each API key as it is, not a
hash of it: that is how the person who made a key copies it again whenever they are signed in. So whoever can read
the database can call the API as every person who has a key.

A server that has just started has nobody in it. The first account, its API key and a first space are made in the
web app, when you run that too, or with curl: [The first steps, by hand](#the-first-steps-by-hand), with the
address of your server in place of `http://localhost:11210`.

## Running the web app in a container

`apps/app/Dockerfile` builds an image of the web app: the pages, built into static files, and nginx handing them
out on port 11211. The address of the API, as browsers reach it, is written into the pages when they are built. So
it is given to the build, and an image talks to that one API:

```sh
docker build -f apps/app/Dockerfile --build-arg VITE_API_URL=https://api.example.com -t pocketmice-app .
```

A container takes no configuration. What has to agree with it is in the configuration of the API: `WEB_ORIGINS`
names the address people open the web app at, or the API refuses what the pages send. The two addresses are under
one registrable domain, like `app.example.com` and `api.example.com`, or browsers do not send the sign-in cookie.

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
  bytes or a `Blob`, and not a stream: the server takes no upload without a length. A file on disk goes up as the
  `Blob` that Node's `openAsBlob` gives for it, so that it is not read into memory whole. `downloadFile` asks
  `getFileDownloadUrl` where the bytes are and fetches them there, so the program has to reach the bucket as well
  as the server.
- A method that fails throws a `PocketmiceError`, and nothing else. Decide what to do by its `code`, which is the
  error code the server answered with, or one of three the SDK arrives at itself: `UNREACHABLE` when the server
  was not reached, `BAD_RESPONSE` when what came back is not what was agreed, `UNEXPECTED` when sending the request
  failed any other way. What was thrown underneath is the error's `cause`.
- A method is one request. Writing to a path whose folders may be missing takes several: the
  [skill](#agent-skill) says which.
- `watchSpace` is a channel of [events](#conversations), read with `for await`. It is one request too: the server
  ends a channel after a few minutes and the loop ends with it, so a program that keeps listening calls it again.

  ```ts
  for (;;) {
    try {
      for await (const event of drive.watchSpace({ spaceId })) {
        // The first event of every channel is `open`. On it, and on every event after, read what is new
        if (event.type === 'open' || event.type === 'message') await answerWhatIsWaiting();
      }
    } catch (error) {
      // UNREACHABLE: the server was not reached, or the channel broke. Wait a moment, then open the next.
      // Anything else does not get better by asking again: the key no longer works, the person is out of the
      // space, or answerWhatIsWaiting threw
      if (!(error instanceof PocketmiceError) || error.code !== 'UNREACHABLE') throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  ```
- It uses no module of Node, so it should run wherever there is a `fetch`. It has been tried on Node 22, 24 and
  26, on Bun and on Deno, and in Chrome from a web page the server allows (`WEB_ORIGINS`): the server answers no
  other page.

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

- Content that is not text, and anything too large to pass through a model, does not go through these three
  tools: it is uploaded to `/api/fileContent`, and downloaded from the address the tool `getFileDownloadUrl` gives.
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

In the web app, "Connect an agent" writes the message a person sends their agent to give it all three: where the
skill is, the address of the server, and one of their keys. The message asks the agent to keep the two variables
for its later sessions, and the skill says where: with the environment variables its host gives every session.

The skill lists every operation an API key may call, and `pnpm check` fails when that list and `packages/contract`
disagree.

## Development

You need Node 26 or later, pnpm 11, a Postgres server, and a bucket of an S3-compatible service for the content
of files (see [`apps/api/.env.example`](apps/api/.env.example) for what serves in development).

Create a role and a database for Pocketmice. The role needs the right to create databases, for the tests: every
test file creates a temporary database of its own and drops it when done.

```sql
create role pocketmice login createdb password '<password>';
create database pocketmice owner pocketmice;
```

Then:

```sh
pnpm install
cp apps/api/.env.example apps/api/.env    # fill in DATABASE_URL, BETTER_AUTH_SECRET and the bucket (S3_*)
cp apps/app/.env.example apps/app/.env    # the address of the API, as the web app reaches it
pnpm --filter @pocketmice/api migrate
pnpm dev
```

`pnpm dev` starts the API and the web app together. The web app is at `http://localhost:11211`, and the API listens
on `http://localhost:11210`:

```sh
curl -X POST http://localhost:11210/api/getServerInfo -H 'content-type: application/json' -d '{}'
```

### The first steps, by hand

With `pnpm dev` these steps are done in the web app, at `http://localhost:11211`: sign up, make a space, and make
the API key an agent calls with, under "API keys". A server that runs the API alone has no web app, and there they
are done with curl. With `.env` as copied from the example, people sign in with a password. Signing up signs you
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
