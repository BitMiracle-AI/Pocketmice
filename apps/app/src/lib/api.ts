import { type ClientErrorCode, createApiClient } from '@pocketmice/client/api';
import type { UniversalErrorCode } from '@pocketmice/contract/errors';
import type { CodeOf, InputOf, Operation, OutputOf } from '@pocketmice/contract/operation';
import { QueryClient, queryOptions } from '@tanstack/react-query';
import { commonText } from '@/lib/text';

// How the pages talk to the api, and where what the api said is kept.
// - What was read from the api is in one cache (queryClient), each answer under the name of its operation and the
//   input it was asked with. A page keeps no copy of its own: it reads the cache, so two places that show the same
//   thing show the same.
// - A read goes through the cache (readQuery). A write is called (call) and answers with a result that says whether
//   it worked; whoever wrote then marks the reads it changed as stale, and the cache asks for them again.
// - A page that changes something shows it when the api has answered, not before: nothing on a page is a guess.

/** How long an answer counts as fresh. Within it the cache hands out what it has; after it, it asks the api again
 * the next time the answer is used, or when the person comes back to the tab */
const FRESH_FOR_MS = 60_000;

/** The codes any call may fail with: the ones any operation may answer with, and the ones this side arrives at itself */
export type CommonFailureCode = UniversalErrorCode | ClientErrorCode;

/**
 * Calls an operation: the answer is the output when it worked, and an error code when it did not. It never throws.
 * There is one client in the app, and this is it.
 * Who is calling is said by the sign-in cookie, which the browser adds. The api is at another origin than the
 * pages, so every request has to say that the cookie goes along: left unsaid, the browser does not send it.
 */
export const call = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL,
  fetch: (url, init) => fetch(url, { ...init, credentials: 'include' }),
  // What was thrown stays in the console, for whoever looks into it. The page says a sentence of its own
  reportError: (error, name) => console.error(`Calling ${name} failed:`, error)
});

/**
 * A read that failed, as the cache hands it on: the cache wants a function that throws. code is what the page goes
 * by; message is English, written for logs and developers, and is not shown to a person.
 */
export class ApiFailure<Code extends string = string> extends Error {
  readonly code: Code | CommonFailureCode;

  constructor(code: Code | CommonFailureCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * The answer to one read, as the cache keeps it: under the name of the operation and the input. Hand it to
 * useQuery, useSuspenseQuery or queryClient.ensureQueryData.
 * Reads only: the cache asks again by itself, and a write must not be sent twice. A write does not pass the type
 * check here.
 */
export function readQuery<Op extends Operation<'read'>>(operation: Op, input: InputOf<Op>) {
  return queryOptions<OutputOf<Op>, ApiFailure<CodeOf<Op>>>({
    queryKey: [operation.name, input],
    queryFn: async () => {
      const result = await call(operation, input);
      if (!result.ok) throw new ApiFailure<CodeOf<Op>>(result.code, result.message);
      return result.data;
    }
  });
}

/**
 * Everything read from the api. A read that failed is not tried again by itself: the page says what happened, and
 * the person tries again.
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: FRESH_FOR_MS, retry: false } }
});

/**
 * What to tell a person about a call that failed with code. own has a sentence for each code the operation lists
 * (the type check reports one that is missing); a code any call may fail with has its sentence in the common text.
 */
export function failureText<Code extends string>(
  code: Code | CommonFailureCode,
  own: Record<Exclude<Code, CommonFailureCode>, string>
): string {
  const sentences: Record<string, string> = { ...commonText.failures, ...own };
  return sentences[code] ?? commonText.failures.UNEXPECTED;
}

/** What to tell a person about something that was thrown while a page loaded, and has no sentence of its own */
export function thrownText(thrown: unknown): string {
  return thrown instanceof ApiFailure ? failureText(thrown.code, {}) : commonText.failures.UNEXPECTED;
}
