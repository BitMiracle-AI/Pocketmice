import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AUTH_ROUTES } from './domains/auth/auth.ts';
import { mountOperations, type OperationDeps } from './http/operation.ts';

/**
 * How long a browser remembers the answer to a preflight, in seconds. While it remembers, a request to the same
 * address goes out without asking first. Chrome honours two hours at most.
 */
const PREFLIGHT_MAX_AGE_SECONDS = 7200;

export interface AppDeps extends OperationDeps {
  /**
   * The sign-in. A request to one of its open addresses (AUTH_ROUTES) is handed to it as it is, and its response
   * is returned as it is. What body each address accepts, it checks itself (see createAuth in
   * domains/auth/auth.ts).
   */
  auth: { handler: (request: Request) => Promise<Response> };
}

/** Every route of the api. It does not listen on a port: main.ts does */
export function createApp(deps: AppDeps) {
  const app = new Hono();

  // The web pages that call the api are served from other origins, so browsers have to be told which of them may,
  // and that they may send the sign-in cookie along.
  // Request headers have no list: whatever a preflight asks for is allowed.
  app.use(cors({ origin: deps.webOrigins, credentials: true, maxAge: PREFLIGHT_MAX_AGE_SECONDS }));

  // Health check: 200 as long as this process answers requests. The database is not asked: when the database is in
  // trouble, starting the api again does not help. Whoever starts or supervises the process asks it.
  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  // Of the addresses of the sign-in library only the open ones are mounted. Any other address under /api/auth is
  // answered like any address that does not exist
  for (const { method, path } of AUTH_ROUTES) {
    app.on(method, path, (c) => deps.auth.handler(c.req.raw));
  }

  // The operations, each at POST /api/<its name>
  mountOperations(app, deps);

  return app;
}
