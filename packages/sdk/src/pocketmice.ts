import { createApiClient, isServerUrl } from '@pocketmice/client/api';
import * as apiKey from '@pocketmice/contract/domains/apiKey';
import * as auth from '@pocketmice/contract/domains/auth';
import * as conversation from '@pocketmice/contract/domains/conversation';
import * as event from '@pocketmice/contract/domains/event';
import * as file from '@pocketmice/contract/domains/file';
import * as invite from '@pocketmice/contract/domains/invite';
import * as profile from '@pocketmice/contract/domains/profile';
import * as server from '@pocketmice/contract/domains/server';
import * as space from '@pocketmice/contract/domains/space';
import { type InputOf, isOperation, type Operation, type OutputOf } from '@pocketmice/contract/operation';
import { type ContentMethods, contentMethods } from './content.ts';
import { type EventMethods, eventMethods } from './events.ts';
import { errorOf } from './pocketmiceError.ts';

// The SDK: how a program that holds an API key uses a Pocketmice drive. A person made the key, and what the
// program does with it is done as that person: in the spaces they are in, in the role they have there.
// The rules:
// - Every operation an API key may call is a method, under the operation's own name, taking its input and
//   returning its output. The methods are not written here: they are made from the definitions in the contract, so
//   an operation that is added there is a method here.
// - What only the person does (an operation whose access is session) is not a method at all. With a key it could
//   only ever be refused.
// - The content of files, which does not go through operations, has three methods of its own (see content.ts).
// - The events of a space, which do not either, have one: a channel, read as it arrives (see events.ts).
// - A method is one request. What takes several, like writing to a path whose folders may be missing, is not a
//   method here: it belongs in the api as an operation, where an agent with the skill or with MCP gets it too.
//   downloadFile is the one that is two: it asks where the bytes are, then fetches them there (see content.ts).
// - A method that fails throws a PocketmiceError, and nothing else. What to do is decided by its code.
// - Nothing here uses a module of Node: the SDK runs wherever there is a fetch.

/**
 * Everything the files of the contract's domains export: the definitions of the operations among it. A file of
 * definitions that is added to the contract is added here; the test fails while an operation an API key may call
 * is missing.
 */
const DEFINITIONS = {
  ...apiKey,
  ...auth,
  ...conversation,
  ...event,
  ...file,
  ...invite,
  ...profile,
  ...server,
  ...space
};

type Definitions = typeof DEFINITIONS;

/** The operations an API key may call: every one but those kept for the person themselves */
type KeyOperations = {
  [Name in keyof Definitions as Definitions[Name] extends Operation<'read' | 'write', 'public' | 'authenticated'>
    ? Name
    : never]: Definitions[Name];
};

/** An operation as a method: its input in, its output out. An input in which nothing is required may be left out */
type Method<Op> = Op extends Operation
  ? Record<never, never> extends InputOf<Op>
    ? (input?: InputOf<Op>) => Promise<OutputOf<Op>>
    : (input: InputOf<Op>) => Promise<OutputOf<Op>>
  : never;

export type OperationMethods = { [Name in keyof KeyOperations]: Method<KeyOperations[Name]> };

/** A drive, as the holder of one API key sees it */
export type Pocketmice = OperationMethods & ContentMethods & EventMethods;

export interface PocketmiceConfig {
  /** The address of the server, like https://drive.example.com */
  url: string;
  /** An API key, made by the person the program works for */
  apiKey: string;
  /**
   * The function that sends the requests. Left out, it is the fetch of the runtime. Pass one to send them another
   * way: with a time limit, through a proxy, or to a stand-in in a test.
   */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

/** Sends one request as the holder of the key */
type Send = (
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: BodyInit; signal?: AbortSignal }
) => Promise<Response>;

/**
 * Builds the drive for one API key. A config that is wrong (the address, the key) fails here, not at the first
 * call. Whether the key works is not asked here: a method finds out, with UNAUTHENTICATED.
 */
export function createPocketmice(config: PocketmiceConfig): Pocketmice {
  if (!isServerUrl(config.url)) {
    throw new Error(`The address of the server, "${config.url}", is not one. Write it like https://drive.example.com.`);
  }
  // Checked as it arrives and not by its type: the usual mistake is an environment variable that is not set
  const key: unknown = config.apiKey;
  if (typeof key !== 'string' || !key.startsWith(apiKey.API_KEY_PREFIX)) {
    throw new Error(`The API key is missing, or is not one: an API key starts with ${apiKey.API_KEY_PREFIX}.`);
  }

  const authorization = apiKey.apiKeyAuthorization(key);
  // Taken out of the config and called on its own: a browser's fetch only runs as the window's
  const given = config.fetch;
  const send: Send = (url, init) => {
    // A redirect is not followed. An address that redirects is not the address of the server: the usual one is
    // http where the server wants https. A fetch that follows a redirect to another origin drops the key on the
    // way, and every call would come back UNAUTHENTICATED with a key that works. Not followed, the call fails
    // with what was answered: the status of the redirect
    const keyed = { ...init, headers: { ...init.headers, authorization }, redirect: 'manual' as const };
    return given ? given(url, keyed) : fetch(url, keyed);
  };

  // An address that is not the server's is fetched with nothing of the holder sent along: the key least of all
  const fetchFrom = (url: string) => (given ? given(url, { method: 'GET' }) : fetch(url, { method: 'GET' }));

  return {
    ...operationMethods(config.url, send),
    ...contentMethods(config.url, send, fetchFrom),
    ...eventMethods(config.url, send)
  };
}

/** A method for every operation an API key may call */
function operationMethods(baseUrl: string, send: Send): OperationMethods {
  const methods: Record<string, unknown> = {};
  // Read as values of any kind: what is picked out is then an operation of any definition, which is what a call
  // of the client takes when the definition is not known until the program runs
  const exported: [string, unknown][] = Object.entries(DEFINITIONS);

  // Nothing is recorded here when a call fails unexpectedly: what was thrown is the cause of the error the method
  // throws, and what to do with it is up to the program
  const call = createApiClient({ baseUrl, fetch: send, reportError: () => {} });

  for (const [name, operation] of exported) {
    if (!isOperation(operation) || operation.access === 'session') continue;

    methods[name] = async (input: Record<string, unknown> = {}) => {
      const result = await call(operation, input);
      if (!result.ok) throw errorOf(result, name);
      return result.data;
    };
  }

  // Which names there are is settled by the same definitions as the type, read the same way
  return methods as OperationMethods;
}
