// Process entry: starts the HTTP server.
import type { Server } from 'node:http';
import { createAdaptorServer } from '@hono/node-server';
import manifest from '../package.json' with { type: 'json' };
import { createApp } from './app.ts';
import { identifyCaller } from './domains/apiKey/identifyCaller.ts';
import { identifyBySession } from './domains/auth/auth.ts';
import { findConversationAccess } from './domains/conversation/findConversationAccess.ts';
import { fileContentTools } from './domains/file/fileContentTools.ts';
import { domainImplementations } from './domains/implementations.ts';
import { findMembership } from './domains/space/findMembership.ts';
import { hostFromEnv, portFromEnv } from './env.ts';
import { logInternalError } from './http/errorLog.ts';
import { auth, db, mail, storage, webOrigins } from './instances.ts';

// The ports of this project start at 11210, one for each unit that listens. A port that is taken is an error and
// the process exits: it never picks another one.
const port = portFromEnv('PORT', 11210);

/** Fires when the process is told to stop (see the end of this file) */
const stopping = new AbortController();

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
  events: { db, stopping: stopping.signal },
  // By the API key a request carries, or else by who is signed in
  identifyCaller: identifyCaller(db, identifyBySession(auth)),
  spaceMembership: (spaceId, userId) => findMembership(db, spaceId, userId),
  conversationAccess: (spaceId, conversationId, userId) => findConversationAccess(db, spaceId, conversationId, userId),
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

// How long a connection is kept open after an answer, when no request follows: two hours, so that it is whatever
// is in front of the api that closes it, and not the api.
// Node by itself closes one after five seconds. A reverse proxy keeps its connections to the api, to send the next
// request down one of them, and keeps them longer than that: nginx for a minute, Traefik for 90 seconds, Caddy for
// two minutes, Envoy for an hour, each unless told otherwise. A request the proxy sends down a connection at the
// moment the api closes it is lost, and the caller is answered 502: every operation is a POST, which a proxy does
// not send a second time. Behind nginx, of 2,700 requests timed to that moment, more than 200 were lost.
// Two hours is longer than each of those. No limit at all is wrong the other way: a caller that is reached without
// a proxy, and is gone without closing, would be kept for ever.
// Stopping (below) is not held up by a connection that carries nothing when the process is told to stop:
// server.close closes those at once. One that has a request in hand at that moment stays open after its answer for
// as long as its caller keeps it, where it was closed six seconds later: behind a proxy the process then stops
// when its ten seconds are up, and not before.
server.keepAliveTimeout = 2 * 60 * 60 * 1000;

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
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (stopping.signal.aborted) return;
    // The channels of events are answers that do not end: they are ended here, or closing the server would wait
    // for each of them
    stopping.abort();
    setTimeout(() => process.exit(0), SHUTDOWN_MS).unref();
    server.close(() => {
      void db.$client.end().finally(() => process.exit(0));
    });
  });
}
