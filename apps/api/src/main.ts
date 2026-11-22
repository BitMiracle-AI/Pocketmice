// Process entry: starts the HTTP server.
import type { Server } from 'node:http';
import { createAdaptorServer } from '@hono/node-server';
import manifest from '../package.json' with { type: 'json' };
import { createApp } from './app.ts';
import { domainImplementations } from './domains/implementations.ts';
import { portFromEnv, requireOrigins } from './env.ts';
import { logInternalError } from './http/errorLog.ts';

// The ports of this project start at 11210, one for each unit that listens. A port that is taken is an error and
// the process exits: it never picks another one.
const port = portFromEnv('PORT', 11210);

const app = createApp({
  webOrigins: requireOrigins('WEB_ORIGINS'),
  implementations: domainImplementations({ version: manifest.version }),
  reportError: logInternalError
});

// createAdaptorServer is typed as possibly an HTTP/2 server; given no HTTP/2 options, what it builds is a plain
// HTTP server
const server = createAdaptorServer({ fetch: app.fetch }) as Server;

// Listens on this machine only: requests from outside come in through a reverse proxy.
server.listen({ port, host: '127.0.0.1' }, () => {
  console.log(`api listening on http://localhost:${port}`);
});

/**
 * When told to stop (a new version is deployed, the container is stopped): stop taking new requests, answer the
 * ones in hand, then exit. Waits at most this long, in milliseconds.
 */
const SHUTDOWN_MS = 10_000;
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    setTimeout(() => process.exit(0), SHUTDOWN_MS).unref();
    server.close(() => process.exit(0));
  });
}
