import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AUTH_ROUTES } from './domains/auth/auth.ts';
import { type FileContentDeps, mountFileContent } from './domains/file/fileContent.ts';
import { mountMcp, type Tool } from './http/mcp.ts';
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
  /**
   * The address the content of files goes through (FILE_CONTENT_PATH in the contract). It is not an operation
   * either: what is sent or answered is the bytes of a file. Its rules are in domains/file/fileContent.ts. Left
   * out, it is not mounted.
   */
  content?: Pick<FileContentDeps, 'db' | 'storage'>;
  /**
   * The address an agent that speaks the Model Context Protocol calls (MCP_PATH; its rules are in http/mcp.ts). It
   * is not an operation either: every operation an API key may call is a tool of it, without being named here.
   * version is what this server says it is, and tools are the tools that are not operations. Left out, it is not
   * mounted.
   */
  mcp?: { version: string; tools: Tool[] };
}

/** Every route of the api. It does not listen on a port: main.ts does */
export function createApp(deps: AppDeps) {
  const app = new Hono();

  // The web pages that call the api are served from other origins, so browsers have to be told which of them may,
  // and that they may send the sign-in cookie along.
  // Request headers have no list: whatever a preflight asks for is allowed. Response headers are the other way
  // round: one a web page is to read has to be named here. etag is what a download answers with: the version that
  // was sent.
  app.use(
    cors({
      origin: deps.webOrigins,
      credentials: true,
      maxAge: PREFLIGHT_MAX_AGE_SECONDS,
      exposeHeaders: ['etag']
    })
  );

  // Health check: 200 as long as this process answers requests. The database is not asked: when the database is in
  // trouble, starting the api again does not help. Whoever starts or supervises the process asks it.
  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  // Of the addresses of the sign-in library only the open ones are mounted. Any other address under /api/auth is
  // answered like any address that does not exist
  for (const { method, path } of AUTH_ROUTES) {
    app.on(method, path, (c) => deps.auth.handler(c.req.raw));
  }

  // The content of files. Its callers pass the same checks as the callers of an operation
  if (deps.content) mountFileContent(app, { ...deps, ...deps.content });

  // The MCP entrance. What its tools do, they do by sending requests to this same app
  if (deps.mcp) {
    mountMcp(app, { ...deps, ...deps.mcp, operations: deps.implementations.map(({ operation }) => operation) });
  }

  // The operations, each at POST /api/<its name>
  mountOperations(app, deps);

  return app;
}
