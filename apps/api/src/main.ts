// Process entry: starts the HTTP server.
import type { Server } from 'node:http';
import { createAdaptorServer } from '@hono/node-server';
import manifest from '../package.json' with { type: 'json' };
import { createApp } from './app.ts';
import { identifyCaller } from './domains/apiKey/identifyCaller.ts';
import { identifyBySession } from './domains/auth/auth.ts';
import { fileContentTools } from './domains/file/fileContentTools.ts';
import { domainImplementations } from './domains/implementations.ts';
import { findMembership } from './domains/space/findMembership.ts';
import { hostFromEnv, portFromEnv } from './env.ts';
import { logInternalError } from './http/errorLog.ts';
import { auth, db, mail, storage, webOrigins } from './instances.ts';

// The ports of this project start at 11210, one for each unit that listens. A port that is taken is an error and
// the process exits: it never picks another one.
const port = portFromEnv('PORT', 11210);

const app = createApp({
  auth,
  webOrigins,
  implementations: domainImplementations({
    db,
    storage,
    version: manifest.version,
    signIn: auth.signIn,
    reportError: logInternalError
  }),
  content: { db, storage },
  // The tools for the content of files go through the content address above
  mcp: { version: manifest.version, tools: fileContentTools },
  // By the API key a request carries, or else by who is signed in
  identifyCaller: identifyCaller(db, identifyBySession(auth)),
  spaceMembership: (spaceId, userId) => findMembership(db, spaceId, userId),
  reportError: logInternalError
});

// createAdaptorServer is typed as possibly an HTTP/2 server; given no HTTP/2 options, what it builds is a plain
// HTTP server
const server = createAdaptorServer({ fetch: app.fetch }) as Server;

// How long a whole request may take: three hours, which is the largest file over a slow line (1 GB at 100 KB/s
// takes just under three).
// Node by itself gives a request five minutes and then answers 408, which cuts off an ordinary upload: 100 MB at
// 2 Mbit/s takes seven. No limit at all is wrong the other way: a caller that stops sending and does not close the
// connection (a laptop that goes to sleep half way through an upload) would be waited for for ever, with the file
// it was writing held open. The headers of a request keep their own limit of a minute.
server.requestTimeout = 3 * 60 * 60 * 1000;

// Listens on this machine only, unless HOST says otherwise: requests from outside come in through a reverse proxy.
// A proxy on another machine cannot reach 127.0.0.1, and to a container every other container is another machine:
// the image sets HOST to 0.0.0.0, every address the container has (see Dockerfile), and who can reach the container
// is for the network around it to limit.
// The proxy must set x-forwarded-for to the address each request came from: the limit on sign-in attempts counts by
// it (see rateLimit in domains/auth/auth.ts).
const host = hostFromEnv('HOST', '127.0.0.1');
server.listen({ port, host }, () => {
  console.log(`api listening on http://${host}:${port}`);
  // How people sign in follows from what the environment says about mail: said here, so whoever set it up sees
  // what they got
  if (mail === null) {
    console.log('people sign in with a password: no mail is sent (set SMTP_URL and MAIL_FROM to sign in with a code)');
  } else if (mail.kind === 'console') {
    console.log('people sign in with a code, which is PRINTED HERE and not sent (MAIL_TO_CONSOLE): for development');
  } else {
    console.log('people sign in with a code sent to their email address');
  }
});

/**
 * When told to stop (a new version is deployed, the container is stopped): stop taking new requests, answer the
 * ones in hand, disconnect from the database, then exit. Waits at most this long, in milliseconds.
 */
const SHUTDOWN_MS = 10_000;
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    setTimeout(() => process.exit(0), SHUTDOWN_MS).unref();
    server.close(() => {
      void db.$client.end().finally(() => process.exit(0));
    });
  });
}
