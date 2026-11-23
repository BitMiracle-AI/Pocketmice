// Process entry: starts the HTTP server.
import type { Server } from 'node:http';
import { createAdaptorServer } from '@hono/node-server';
import manifest from '../package.json' with { type: 'json' };
import { createApp } from './app.ts';
import { identifyCaller } from './domains/apiKey/identifyCaller.ts';
import { identifyBySession } from './domains/auth/auth.ts';
import { domainImplementations } from './domains/implementations.ts';
import { findMembership } from './domains/space/findMembership.ts';
import { portFromEnv } from './env.ts';
import { logInternalError } from './http/errorLog.ts';
import { auth, db, storage, webOrigins } from './instances.ts';

// The ports of this project start at 11210, one for each unit that listens. A port that is taken is an error and
// the process exits: it never picks another one.
const port = portFromEnv('PORT', 11210);

const app = createApp({
  auth,
  webOrigins,
  implementations: domainImplementations({ db, storage, version: manifest.version, reportError: logInternalError }),
  content: { db, storage },
  // By the API key a request carries, or else by who is signed in
  identifyCaller: identifyCaller(db, identifyBySession(auth)),
  spaceMembership: (spaceId, userId) => findMembership(db, spaceId, userId),
  reportError: logInternalError
});

// createAdaptorServer is typed as possibly an HTTP/2 server; given no HTTP/2 options, what it builds is a plain
// HTTP server
const server = createAdaptorServer({ fetch: app.fetch }) as Server;

// A request may take as long as its bytes take to arrive. Node by itself gives a whole request five minutes and
// then answers 408, which cuts off the upload of a large file over a slow line: 100 MB at 2 Mbit/s takes seven.
// The headers of a request keep their own limit of a minute. How long a connection may stay silent is for the
// reverse proxy to limit: it is the one that talks to the outside
server.requestTimeout = 0;

// Listens on this machine only: requests from outside come in through a reverse proxy. The proxy must set
// x-forwarded-for to the address each request came from: the limit on sign-in attempts counts by it (see rateLimit
// in domains/auth/auth.ts).
server.listen({ port, host: '127.0.0.1' }, () => {
  console.log(`api listening on http://localhost:${port}`);
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
