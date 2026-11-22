import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { mountOperations, type OperationDeps } from './http/operation.ts';

/**
 * How long a browser remembers the answer to a preflight, in seconds. While it remembers, a request to the same
 * address goes out without asking first. Chrome honours two hours at most.
 */
const PREFLIGHT_MAX_AGE_SECONDS = 7200;

export type AppDeps = OperationDeps;

/** Every route of the api. It does not listen on a port: main.ts does */
export function createApp(deps: AppDeps) {
  const app = new Hono();

  // The web pages that call the api are served from other origins, so browsers have to be told which of them may.
  // Request headers have no list: whatever a preflight asks for is allowed.
  app.use(cors({ origin: deps.webOrigins, maxAge: PREFLIGHT_MAX_AGE_SECONDS }));

  // Health check: 200 as long as this process answers requests. Whoever starts or supervises the process asks it.
  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  // The operations, each at POST /api/<its name>
  mountOperations(app, deps);

  return app;
}
