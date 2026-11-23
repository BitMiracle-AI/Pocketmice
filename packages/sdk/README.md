# @pocketmice/sdk

The TypeScript SDK of [Pocketmice](https://github.com/BitMiracle-AI/Pocketmice), a cloud drive that people and AI
agents share. A program that holds an API key uses the drive through it.

A person made the key, and what the program does with it is done as that person: in the spaces they are in, in the
role they have there. A key reads and writes, or only reads, and no key decides who gets into a space.

> **Status: early.** Pocketmice is not ready for production yet, and neither is its SDK.

## Install

```sh
npm install @pocketmice/sdk
```

It is an ES module that comes with its types, and [zod](https://zod.dev) is its only dependency. It uses no module
of Node, so it should run wherever there is a `fetch`. It has been tried on Node 22, 24 and 26, on Bun and on Deno,
and in Chrome from a web page the server allows (`WEB_ORIGINS` in the configuration of the API): the server answers
no other page. TypeScript finds the types with `moduleResolution` set to `nodenext` or `bundler`; it has been tried
with TypeScript 5.9, 6.0 and 7.0.

## The first calls

It takes the address of the API of a Pocketmice server and an API key. A person makes a key in the web app, under
"API keys", and it starts with `pm_`. How to run a server is in the
[repository](https://github.com/BitMiracle-AI/Pocketmice#development).

```ts
import { createPocketmice, PocketmiceError } from '@pocketmice/sdk';

const drive = createPocketmice({ url: 'https://api.example.com', apiKey: 'pm_...' });

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

## The methods

- Every operation an API key may call is a method of the same name, taking the operation's input and returning its
  output: `getFiles`, `createFolder`, `getMatchingFiles`, `createMessage` and the rest. The types say what each
  takes and answers with. What each does, and what its error codes mean there, is in the definitions the methods
  are made from, in
  [`packages/contract`](https://github.com/BitMiracle-AI/Pocketmice/tree/main/packages/contract/src/domains), and
  the [skill](https://github.com/BitMiracle-AI/Pocketmice/blob/main/skills/pocketmice/SKILL.md) lists them all.
- What only the person does, like making a key or deleting for good, is not there.
- A method is one request. Writing to a path whose folders may be missing takes several: the skill says which.

## The content of files

The content has three methods: `uploadFile`, `uploadFileVersion` and `downloadFile`.

- Content is text, bytes or a `Blob`, and not a stream: the server takes no upload without a length. A file is at
  most 1 GB.
- A file on disk goes up as the `Blob` that Node's `openAsBlob` gives for it, so that it is not read into memory
  whole:

  ```ts
  import { openAsBlob } from 'node:fs';

  await drive.uploadFile({ spaceId, parentId: null, name: 'data.csv', content: await openAsBlob('data.csv') });
  ```

- A download says which version it is (`versionId`) and hands out its bytes once: all of them with `text()` or
  `bytes()`, or as they arrive with `body`, a stream, for content too large to hold.
- Writing over a file names the version the new content was made from (`baseVersionId`). When somebody wrote to
  the file in between, the upload fails with `CONFLICT` and nothing is written.

## What happens in a space

`watchSpace` is a channel of [events](https://github.com/BitMiracle-AI/Pocketmice#conversations), read with
`for await`. An event says that something changed and not what it changed to: read that with the methods. It is
one request too: the server ends a channel after a few minutes and the loop ends with it, so a program that keeps
listening calls it again.

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

## When a call fails

A method that fails throws a `PocketmiceError`, and nothing else. Decide what to do by its `code`:

- an error code the server answered with, like `UNAUTHENTICATED`, `FORBIDDEN`, `UNKNOWN_SPACE`, `NOT_FOUND` or
  `CONFLICT`. The list, with what each means, is in
  [`errors.ts`](https://github.com/BitMiracle-AI/Pocketmice/blob/main/packages/contract/src/errors.ts);
- or one of three the SDK arrives at itself: `UNREACHABLE` when the server was not reached, `BAD_RESPONSE` when
  what came back is not what was agreed, `UNEXPECTED` when sending the request failed any other way.

`operation` is the method that failed, `message` is English, for logs and developers, and what was thrown
underneath is the error's `cause`.

`createPocketmice` itself throws at once, an `Error`, when the address or the key is not one. Whether the key works
is not asked there: a method finds out, with `UNAUTHENTICATED`.

To send the requests another way (with a time limit, through a proxy, or to a stand-in in a test), pass a `fetch`
in the config. Left out, it is the `fetch` of the runtime.

## Versions

The SDK is released together with the server and has its version number: the methods of a version are made from
the definitions the server of that version answers by. `getServerInfo` answers with the version of the server. A
method that an older server does not have fails with `UNKNOWN_OPERATION`.

## License

[Apache-2.0](https://github.com/BitMiracle-AI/Pocketmice/blob/main/LICENSE). The source is in
[`packages/sdk`](https://github.com/BitMiracle-AI/Pocketmice/tree/main/packages/sdk) of the repository, and what
does not work is reported in its [issues](https://github.com/BitMiracle-AI/Pocketmice/issues).
