import { type ApiClientConfig, type ClientErrorCode, createApiClient, type Result } from '@pocketmice/client/api';
import { createAuthClient } from '@pocketmice/client/auth';
import { getProfile } from '@pocketmice/contract/domains/profile';
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
// - Who is signed in is what the api says (currentUserQuery). The browser holds the cookie and the page cannot
//   read it: nothing in the page remembers that someone signed in.

/** How long an answer counts as fresh. Within it the cache hands out what it has; after it, it asks the api again
 * the next time the answer is used, or when the person comes back to the tab */
const FRESH_FOR_MS = 60_000;

/** The codes any call may fail with: the ones any operation may answer with, and the ones this side arrives at itself */
export type CommonFailureCode = UniversalErrorCode | ClientErrorCode;

/**
 * How every request to the api is sent. Who is calling is said by the sign-in cookie, which the browser adds. The
 * api is at another origin than the pages, so every request has to say that the cookie goes along: left unsaid,
 * the browser does not send it, and does not keep the one a sign-in sets.
 */
const config: ApiClientConfig = {
  baseUrl: import.meta.env.VITE_API_URL,
  fetch: (url, init) => fetch(url, { ...init, credentials: 'include' }),
  // What was thrown stays in the console, for whoever looks into it. The page says a sentence of its own
  reportError: (error, name) => console.error(`Calling ${name} failed:`, error)
};

/** The one client of the app. It is not exported: a page calls an operation through call or readQuery */
const api = createApiClient(config);

/** Signing in and out: the requests to the addresses that are not operations (see @pocketmice/client/auth) */
export const auth = createAuthClient(config);

/**
 * Calls an operation: the answer is the output when it worked, and an error code when it did not. It never throws.
 * Every call of an operation goes through here.
 */
export async function call<Op extends Operation>(operation: Op, input: InputOf<Op>): Promise<Result<Op>> {
  const result = await api(operation, input);
  if (!result.ok) heardFailure(result.code);
  return result;
}

/**
 * What the cache makes of a request that failed with code. call does this for every operation; whoever sends a
 * request that is not an operation (the content of a file) says so here.
 * Any request that is answered "not signed in" makes what the cache holds about who is signed in untrue. It is
 * marked stale and not asked again at once: the page stays as it is, with what the person was typing, and says
 * that they are signed out. The next page they go to asks the api, and takes them to the sign-in page.
 */
export function heardFailure(code: string): void {
  if (code === 'UNAUTHENTICATED') {
    void queryClient.invalidateQueries({ queryKey: currentUserQuery.queryKey, refetchType: 'none' });
  }
}

/**
 * The address of something of the api that is not an operation: path is what comes after the host, like the
 * address the content of a file goes through. A request sent there by hand says, as every other does, that the
 * sign-in cookie goes along.
 */
export function apiAddress(path: string): string {
  return new URL(path, config.baseUrl).href;
}

/**
 * Something was written in the space spaceId: everything read from that space is marked stale, and what a page is
 * showing is asked for again. It is not worked out which answers the write changed: a rename changes the path of
 * everything under a folder, and an answer that is asked for once too often costs less than one that is wrong.
 */
export function spaceChanged(spaceId: string): void {
  void queryClient.invalidateQueries({
    predicate: ({ queryKey }) => (queryKey[1] as { spaceId?: unknown } | undefined)?.spaceId === spaceId
  });
}

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
 * Who is signed in: the profile of the person the cookie belongs to. The pages for signed-in people are let in by
 * it (routes/_app.tsx) and read it with useCurrentUser. It is kept while the page is open, also when nothing on
 * the page is using it at the moment.
 */
export const currentUserQuery = queryOptions({ ...readQuery(getProfile, {}), gcTime: Number.POSITIVE_INFINITY });

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
