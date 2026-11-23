import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { apiKeyAuthorization, bearerToken } from '@pocketmice/contract/domains/apiKey';
import { errorBody } from '@pocketmice/contract/errors';
import { type Operation, operationPath } from '@pocketmice/contract/operation';
import type { Hono } from 'hono';
import type { z } from 'zod';
import { type AdmissionDeps, admitCaller, fail } from './operation.ts';

// The MCP entrance: the address an agent that speaks the Model Context Protocol calls the api at. It is not an
// operation: one address carries every tool, in the protocol's own requests and responses.
// The rules of this address:
// - It is for a caller with an API key, sent as a bearer token, the way an agent sends every request. A request
//   without a key that works is refused before the protocol is spoken. Someone signed in on a web page has no use
//   for it, and their session does not open it.
// - A tool is a request to this same api, sent as the caller of the tool: to an operation, or to another entrance
//   such as the address the content of files goes through. Nothing is done here that a request from outside could
//   not do, and nothing is decided here: who may call what is settled where it always is, when that request comes
//   in. So a tool does what the key it was called with does over HTTP, and nothing else.
// - Every operation an API key may call is a tool, under the operation's own name, with its description and its
//   input. The list is not written a second time: it is the operations of the api, less the ones kept for the
//   person themselves (access session).
// - Tools that are not operations are handed in by whoever mounts the address (see Tool).
// - A tool whose request is refused answers with the error code and the message of that refusal, as a result the
//   model reads and can act on, like "CONFLICT: …".
// - Nothing is kept between two requests: each is answered by a server made for it. There are tools and nothing
//   else: no resources, no prompts, and nothing is sent that was not asked for.

/** The address of the MCP entrance */
export const MCP_PATH = '/api/mcp';

/**
 * A request to the MCP entrance is at most this large, in bytes. It is larger than the input of an operation
 * (MAX_INPUT_BYTES), because a text an agent writes to a file comes inside it.
 */
export const MAX_MCP_INPUT_BYTES = 4 * 1024 * 1024;

const INTERNAL_MESSAGE = 'INTERNAL: The server ran into an internal error.';

/**
 * What a tool answers with: text for the model to read, and whether it is a failure.
 * A type and not an interface: the protocol's result may carry fields of any name, and only a type is taken for one
 * that may.
 */
export type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

/**
 * Sends one request to this api as the caller of the tool: the path with its query, and what fetch takes. It
 * carries the API key the tool was called with and the address that call came from (x-forwarded-for, which
 * operations limit their callers by), and nothing else of the request the tool came in.
 */
export type Send = (path: string, init?: RequestInit) => Promise<Response>;

/** A tool of the MCP entrance. The exact type of its input was matched up in tool, and is not carried along here */
export interface Tool {
  name: string;
  /** All a model reads about the tool before it calls it */
  description: string;
  /**
   * A read changes nothing. The client is told, and may ask a person before it lets a model write. It decides
   * nothing here: whether a key may write is settled by the request the tool sends.
   */
  kind: 'read' | 'write';
  /** What it takes. A call is checked against it before run is called */
  input: z.ZodObject;
  run: (input: unknown, send: Send) => Promise<ToolResult>;
}

/**
 * Writes a tool that is not an operation. The type of what run is given comes from input: a run that does not
 * match it fails the type check.
 */
export function tool<Input extends z.ZodObject>(definition: {
  name: string;
  description: string;
  kind: 'read' | 'write';
  input: Input;
  run: (input: z.output<Input>, send: Send) => Promise<ToolResult>;
}): Tool {
  // By the time run is called the call has been checked against input, so the assertion holds
  return definition as unknown as Tool;
}

/** The result of a tool that worked: this value, as JSON */
export function answer(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

/** The result of a tool that failed: one sentence saying why, for the model to act on */
export function failure(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/** The result of a tool whose request was refused: the code and the message of the refusal */
export async function refusal(response: Response): Promise<ToolResult> {
  const body = errorBody.safeParse(await response.json().catch(() => undefined));
  return failure(
    body.success
      ? `${body.data.error.code}: ${body.data.error.message}`
      : `INTERNAL: The server answered with status ${response.status} and no error code.`
  );
}

/** The tool an operation is: its name, its description and its input, and a call of it */
export function operationTool(operation: Operation): Tool {
  return {
    name: operation.name,
    description: operation.description,
    kind: operation.kind,
    input: operation.input,
    run: async (input, send) => {
      const response = await send(operationPath(operation), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input)
      });
      return response.ok ? answer(await response.json()) : refusal(response);
    }
  };
}

export interface McpDeps extends AdmissionDeps {
  /** Every operation of the api. The ones an API key may call become tools */
  operations: Operation[];
  /** The tools that are not operations */
  tools: Tool[];
  /** The version of this server, as getServerInfo answers it */
  version: string;
}

/**
 * Mounts the MCP entrance on the app. The requests its tools send go to this same app, without leaving the
 * process: they are received, checked and answered like any request from outside.
 */
export function mountMcp(app: Hono, deps: McpDeps): void {
  const tools = [...deps.operations.filter(({ access }) => access !== 'session').map(operationTool), ...deps.tools];
  const names = new Set<string>();
  for (const { name } of tools) {
    if (names.has(name)) throw new Error(`There is more than one MCP tool called ${name}.`);
    names.add(name);
  }

  const handler = createMcpHandler(
    ({ authInfo, requestInfo }) => {
      if (!authInfo) throw new Error('The MCP entrance was reached without an API key.');
      const forwardedFor = requestInfo?.headers.get('x-forwarded-for');
      const send: Send = async (path, init = {}) => {
        const headers = new Headers(init.headers);
        headers.set('authorization', apiKeyAuthorization(authInfo.token));
        // Where the call came from goes along: a limit on how often something is asked from one address holds for
        // a tool as it does for a request from outside
        if (forwardedFor) headers.set('x-forwarded-for', forwardedFor);
        return app.request(path, { ...init, headers });
      };

      const server = new McpServer({ name: 'pocketmice', version: deps.version });
      for (const { name, description, kind, input, run } of tools) {
        server.registerTool(
          name,
          {
            description,
            inputSchema: input,
            // Nothing a key can do is beyond undoing: what cannot be undone is kept for the person themselves, and
            // is not a tool
            annotations: kind === 'read' ? { readOnlyHint: true } : { readOnlyHint: false, destructiveHint: false }
          },
          async (checked): Promise<ToolResult> => {
            try {
              return await run(checked, send);
            } catch (thrown) {
              // What went wrong is for the log. Left to the protocol's layer, the caller would be told
              deps.reportError(thrown, `${MCP_PATH} ${name}`);
              return failure(INTERNAL_MESSAGE);
            }
          }
        );
      }
      return server;
    },
    // How a request is answered is left to the protocol's layer. A client of the revision of 2026-07-28 gets one
    // JSON body: that layer only makes a stream of it when a tool sends something before its result, and no tool
    // here does. A client of the revisions before gets its answer as a stream of one event.
    // What that layer refuses of a request (a method it does not have, a body that is not the protocol's) it
    // answers to the caller. That is the caller's mistake and not this server failing, so it is not reported
    { maxRequestBodySize: MAX_MCP_INPUT_BYTES }
  );

  app.all(MCP_PATH, async (c) => {
    // How large the body is, is settled the way it is for an operation, and for the reason given there (see admit
    // in operation.ts): by the length the request declares, without touching the body, and a body sent in chunks,
    // which declares none, is not accepted
    const declaredLength = c.req.header('content-length');
    if (declaredLength !== undefined && Number(declaredLength) > MAX_MCP_INPUT_BYTES) {
      return fail(c, 'INPUT_TOO_LARGE', `The request body is larger than ${MAX_MCP_INPUT_BYTES} bytes.`);
    }
    if (c.req.header('transfer-encoding') !== undefined) {
      return fail(c, 'INVALID_INPUT', 'Send the request body with a content-length header, not in chunks.');
    }

    const key = bearerToken(c.req.header('authorization'));
    if (key === null) return fail(c, 'UNAUTHENTICATED', 'Send an API key as a bearer token to call this address.');
    // Any key that works is let in here. What it may do is asked again by each request a tool sends
    const caller = await admitCaller(c, { access: 'authenticated', kind: 'read' }, deps);
    if (caller instanceof Response) return caller;

    return handler.fetch(c.req.raw, { authInfo: { token: key, clientId: caller.apiKeyId ?? '', scopes: [] } });
  });
}
