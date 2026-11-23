// For the tests of the MCP entrance: a client that speaks the protocol the way an agent's host does. It is the
// client of the protocol's own SDK, so what the tests see is what a real host sees. It is not a test, and nothing a
// running server uses imports it.
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { MCP_PATH } from './mcp.ts';

/**
 * The two ways of speaking the protocol. modern is the revision of 2026-07-28, where every request stands on its
 * own; legacy is the revisions before it, which open with a handshake. The entrance answers both.
 */
export type McpEra = 'modern' | 'legacy';

/** What a tool answered with, as the tests look at it */
export interface Called {
  /** The text of each part of the answer */
  texts: string[];
  isError: boolean;
}

/**
 * Connects a client to the MCP entrance of an app. send delivers one request to the app: who is calling is added
 * there.
 */
export async function connectMcp(
  send: (path: string, init?: RequestInit) => Promise<Response>,
  era: McpEra = 'modern'
): Promise<Client> {
  const client = new Client(
    { name: 'pocketmice-tests', version: '1.0.0' },
    era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {}
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(MCP_PATH, 'http://api.test'), {
      fetch: (url, init) => send(new URL(String(url)).pathname, init)
    })
  );
  return client;
}

/** Calls a tool and returns what it answered with */
export async function callTool(client: Client, name: string, input: Record<string, unknown>): Promise<Called> {
  const result = await client.callTool({ name, arguments: input });
  const content = (result.content ?? []) as { type: string; text?: string }[];
  return { texts: content.map((part) => part.text ?? ''), isError: result.isError === true };
}
