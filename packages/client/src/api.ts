import { errorBody, isUniversalErrorCode, type UniversalErrorCode } from '@pocketmice/contract/errors';
import {
  type CodeOf,
  type InputOf,
  type Operation,
  type OutputOf,
  operationPath
} from '@pocketmice/contract/operation';

/**
 * A failure the server did not report, but this side arrived at by itself:
 * UNREACHABLE: the server could not be reached. BAD_RESPONSE: it was reached, but what came back is not what was
 * agreed. UNEXPECTED: this side failed in a way nobody foresaw while sending the request — a bug on this side.
 */
export type ClientErrorCode = 'UNREACHABLE' | 'BAD_RESPONSE' | 'UNEXPECTED';

export interface Failure<Code extends string = never> {
  ok: false;
  /** A code the operation lists, a code any operation may answer with, or a failure this side arrived at itself */
  code: Code | UniversalErrorCode | ClientErrorCode;
  /** English, for logs and developers. What to tell a person is up to the caller, decided by the code */
  message: string;
  /**
   * What was thrown on this side, when that is how the call failed: UNREACHABLE and UNEXPECTED have it, a failure
   * the server answered with has none. It is for whoever looks into the failure: the fetch of Node says no more
   * than "fetch failed", and why is in what it threw.
   */
  cause?: unknown;
}

/** The result of one call: the output if it worked, an error code if it did not */
export type Result<Op extends Operation> = { ok: true; data: OutputOf<Op> } | Failure<CodeOf<Op>>;

export interface ApiClientConfig {
  /** The address of the api, like https://api.example.com */
  baseUrl: string;
  /**
   * The function that actually sends the request. How the caller proves who it is, is added here by each kind of
   * caller. Only the status and the body of the response are used, so the fetch of a browser, of a phone app and of
   * Node can each be passed in behind a thin wrapper.
   */
  fetch: (
    url: string,
    init: { method: 'POST'; headers: Record<string, string>; body: string }
  ) => Promise<{ status: number; text: () => Promise<string> }>;
  /**
   * Called when this side fails unexpectedly (UNEXPECTED), so that it is recorded in one place, whichever call it
   * happened in. The result of that call has what was thrown too, as its cause.
   */
  reportError: (error: unknown, name: string) => void;
}

/**
 * Builds a client for the api. What comes back is a function: give it the definition of an operation and the input,
 * it makes the call and returns the result.
 * That function never throws. However a call fails, the caller gets a result carrying an error code, so nothing is
 * left "in progress" for ever because one kind of error was not caught.
 * A config that is wrong (the address) fails when the client is built, not at the first call.
 */
export function createApiClient(config: ApiClientConfig) {
  if (!isServerUrl(config.baseUrl)) {
    throw new Error(`API base URL "${config.baseUrl}" is invalid. Write it like https://api.example.com.`);
  }
  const headers = { 'content-type': 'application/json' };
  // Taken out of the config and called on its own. A browser's fetch only runs as the window's: called as
  // config.fetch it throws, a TypeError, which below would be taken for a server that cannot be reached
  const send = config.fetch;

  return async function call<Op extends Operation>(operation: Op, input: InputOf<Op>): Promise<Result<Op>> {
    const url = new URL(operationPath(operation), config.baseUrl).href;
    const name = operation.name;

    // Writing the input as JSON is a step of its own, apart from sending the request: an input that JSON cannot
    // express (a circular reference, say) also throws a TypeError, and in one step with the request it would be
    // taken for an unreachable server.
    let body: string;
    try {
      body = JSON.stringify(input);
    } catch (thrown) {
      config.reportError(thrown, name);
      return unexpectedFailure(name, thrown);
    }

    let status: number;
    let text: string;
    try {
      const response = await send(url, { method: 'POST', headers, body });
      status = response.status;
      text = await response.text();
    } catch (thrown) {
      const failure = failureOfThrown(thrown, name);
      if (failure.code === 'UNEXPECTED') config.reportError(thrown, name);
      return failure;
    }

    if (status >= 200 && status < 300) {
      const answer = parseJson(text);
      if (!isObject(answer)) {
        return {
          ok: false,
          code: 'BAD_RESPONSE',
          message: `The server answered ${name} with status ${status}, but the body is not a JSON object.`
        };
      }
      // The output is not checked against the definition again here. The server checked it before sending; and
      // this side may be older than the server, and must keep working when the server adds a field it has never
      // heard of.
      return { ok: true, data: answer as OutputOf<Op> };
    }

    return failureOf(name, status, text, operation.errors);
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * Whether this is the address of a server: a URL of http or https.
 * That it is a URL is not enough. A host and a port with the scheme forgotten, like localhost:11210, is one too,
 * with the host for its scheme: no request can go to it, and building the address of an operation from it throws.
 */
export function isServerUrl(address: string): boolean {
  if (!URL.canParse(address)) return false;
  const { protocol } = new URL(address);
  return protocol === 'http:' || protocol === 'https:';
}

// The two functions below are how a call reads a failure. They are exported for a caller that sends a request
// which is not an operation, to the address the content of files goes through, and reads its failures the same way.

/**
 * What it means that something was thrown while a request was sent, or while its answer was read. name is what was
 * being called, for the message.
 * fetch throws a TypeError when it cannot connect, or when the body breaks off half way: UNREACHABLE. Any other
 * error is not the network and must not be reported as one: it is a bug on this side, UNEXPECTED.
 * Either way, what was thrown is the cause of the failure.
 */
export function failureOfThrown(thrown: unknown, name: string): Failure {
  if (!(thrown instanceof TypeError)) return unexpectedFailure(name, thrown);
  return { ok: false, code: 'UNREACHABLE', message: `Could not reach the server: ${thrown.message}`, cause: thrown };
}

/**
 * What an answer that is not a success says went wrong: its status and its body, as text. name is what was called,
 * for the message. declared are the codes this side knows that the answer may carry, besides the ones any
 * operation may answer with.
 */
export function failureOf<Code extends string>(
  name: string,
  status: number,
  text: string,
  declared: readonly Code[]
): Failure<Code> {
  const parsed = errorBody.safeParse(parseJson(text));
  if (!parsed.success) {
    // A proxy's own 502 page, for example
    return {
      ok: false,
      code: 'BAD_RESPONSE',
      message: `The server answered ${name} with status ${status} and no error code.`
    };
  }

  const { code, message } = parsed.data.error;
  if (isUniversalErrorCode(code) || isDeclared(declared, code)) return { ok: false, code, message };

  // The code is not in this side's definition: this side is older than the server. It is not passed off as a code
  // this side knows, so the branches a caller wrote for "the codes I know" cannot miss a case.
  return {
    ok: false,
    code: 'BAD_RESPONSE',
    message: `The server answered ${name} with an error code this client does not know: ${code}. ${message}`
  };
}

function unexpectedFailure(name: string, thrown: unknown): Failure {
  return { ok: false, code: 'UNEXPECTED', message: `Calling ${name} failed before a response arrived.`, cause: thrown };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDeclared<Code extends string>(declared: readonly Code[], code: string): code is Code {
  return declared.some((one) => one === code);
}
