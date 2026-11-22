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
  /** Called when this side fails unexpectedly, to record why. The caller of the client only gets UNEXPECTED */
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
  if (!URL.canParse(config.baseUrl)) {
    throw new Error(`API base URL "${config.baseUrl}" is invalid. Write it like https://api.example.com.`);
  }
  const headers = { 'content-type': 'application/json' };

  return async function call<Op extends Operation>(operation: Op, input: InputOf<Op>): Promise<Result<Op>> {
    const url = new URL(operationPath(operation), config.baseUrl).href;
    const name = operation.name;
    const unexpected = (thrown: unknown): Failure => {
      config.reportError(thrown, name);
      return { ok: false, code: 'UNEXPECTED', message: `Calling ${name} failed before a response arrived.` };
    };

    // Writing the input as JSON is a step of its own, apart from sending the request: an input that JSON cannot
    // express (a circular reference, say) also throws a TypeError, and in one step with the request it would be
    // taken for an unreachable server.
    let body: string;
    try {
      body = JSON.stringify(input);
    } catch (thrown) {
      return unexpected(thrown);
    }

    let status: number;
    let text: string;
    try {
      const response = await config.fetch(url, { method: 'POST', headers, body });
      status = response.status;
      text = await response.text();
    } catch (thrown) {
      // fetch throws a TypeError when it cannot connect, or when the body breaks off half way. Any other error is
      // not the network and must not be reported as one: it is a bug on this side.
      if (!(thrown instanceof TypeError)) return unexpected(thrown);
      return { ok: false, code: 'UNREACHABLE', message: `Could not reach the server: ${thrown.message}` };
    }

    const answer = parseJson(text);

    if (status >= 200 && status < 300) {
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

    const parsed = errorBody.safeParse(answer);
    if (!parsed.success) {
      // A proxy's own 502 page, for example
      return {
        ok: false,
        code: 'BAD_RESPONSE',
        message: `The server answered ${name} with status ${status} and no error code.`
      };
    }

    const { code, message } = parsed.data.error;
    if (isUniversalErrorCode(code) || isDeclared(operation, code)) return { ok: false, code, message };

    // The code is not in this side's definition: this side is older than the server. It is not passed off as a code
    // this side knows, so the branches a caller wrote for "the codes I know" cannot miss a case.
    return {
      ok: false,
      code: 'BAD_RESPONSE',
      message: `The server answered ${name} with an error code this client does not know: ${code}. ${message}`
    };
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

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

function isDeclared<Op extends Operation>(operation: Op, code: string): code is CodeOf<Op> {
  return operation.errors.some((declared) => declared === code);
}
