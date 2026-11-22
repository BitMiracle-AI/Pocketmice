# Pocketmice

**A cloud drive that people and AI agents share.** People use it the way they use any cloud drive. Agents are
collaborators on the same files: they read what people give them and hand back what they make.

> **Status: just started.** The repository holds only the foundation: how an operation of the API is defined,
> implemented and called, and the checks that keep the structure of the code in place. There is no drive yet, and
> nothing here is usable.

## What is planned

- A web app for people: upload, organise and share files, alone or in a team.
- Three ways in for agents: an HTTP API with a TypeScript SDK, an MCP server, and an agent skill.
- A server you can run yourself, on Postgres.

## Repository layout

```
apps/api            the API server (Hono on Node)
packages/contract   the definition of every operation: its input, its output, its error codes
packages/client     the code every caller shares to call the API
scripts/            checks of the repository's structure, run by `pnpm check`
```

## How the API is built

Every operation is a `POST` to `/api/<name>`, and its name is a verb followed by a noun: `getServerInfo`. An
operation is written down once, in `packages/contract`:

```ts
export const getServerInfo = operation({
  name: 'getServerInfo',
  kind: 'read',
  input: z.object({}),
  output: z.object({ version: z.string() }),
  errors: []
});
```

The server implements it from that definition with `implement()`, and callers call it from that definition with
`@pocketmice/client`, so the input, the output and the error codes are typed on both sides and cannot drift apart.
A call never throws: it returns the output, or an error code.

```ts
const call = createApiClient({ baseUrl: 'http://localhost:11210', fetch, reportError: console.error });

const result = await call(getServerInfo, {});
if (result.ok) console.log(result.data.version);
```

A failure is the real HTTP status with one error body, `{ "error": { "code": "...", "message": "..." } }`. Callers
decide what to do by the code; the message is for logs and developers.

## Development

You need Node 26 or later and pnpm 11.

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
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
