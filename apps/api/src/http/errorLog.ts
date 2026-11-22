import { inspect } from 'node:util';

/** How many levels of cause, one error wrapping another, are written out at most */
const MAX_CAUSES = 5;
/**
 * How many characters of the SQL of a failed query are written at most. A statement that writes rows in bulk can
 * run to hundreds of thousands of characters; its beginning is enough to tell which statement it is.
 */
const MAX_QUERY_LENGTH = 1000;

/** Only what looks like an error code is written out: letters, digits, dots, underscores, hyphens */
function plainCode(value: unknown): string | null {
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' && /^[\w.-]{1,80}$/.test(value) ? value : null;
}

/**
 * Whether this error is a "query failed" from a database library: an error that carries the statement and the
 * parameters of the query. If so, returns the SQL (with $1, $2 in it and no values); if not, null.
 * It is recognised by its shape, not by its class, so it does not matter which library, or which copy of it,
 * raised the error: recognised by class, an error from another copy would go unrecognised and its parameters would
 * be logged as they are.
 */
function failedQuery(error: Error): string | null {
  const { query, params } = error as { query?: unknown; params?: unknown };
  const looksLikeOne = typeof query === 'string' && params !== undefined;
  if (error.constructor.name !== 'DrizzleQueryError' && !looksLikeOne) return null;
  if (typeof query !== 'string') return '';
  if (query.length <= MAX_QUERY_LENGTH) return query;
  return `${query.slice(0, MAX_QUERY_LENGTH)} [${query.length - MAX_QUERY_LENGTH} more characters]`;
}

/**
 * Where the error happened: the "at …" lines of its stack. A stack begins with another copy of the message and
 * only then gives the positions, so only the part after the message is read.
 * Picking every line of the stack that starts with "at" would be wrong. A message can run over several lines, and
 * the message of a failed query is followed by the parameters of that query: a parameter with a line that happens
 * to start with "at " would be logged as a position, along with the parameters after it.
 * When the message cannot be found in the stack (it was changed after the stack was written), no positions are
 * written.
 */
function framesOf(error: Error): string[] {
  const stack = error.stack ?? '';
  const at = stack.indexOf(error.message);
  if (at === -1) return [];
  return stack
    .slice(at + error.message.length)
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '));
}

/**
 * Writes an error as the text that goes into the log: its name, its message, its error code, where it happened, and
 * then the error it wraps as its cause, one level per line.
 *
 * An error is never handed to console as it is: printed that way, everything attached to it is written out, and a
 * failed database query has the parameters of the query attached, with another copy in its message. Parameters are
 * data: email addresses, session ids, keys. An error from the database itself also has a detail, which for a
 * duplicate names the value that was duplicated. So:
 * - of a failed query only the SQL is written (with $1, $2 in it and no values), never the parameters;
 * - of any error only these four things are written — name, message, code, position — and nothing else attached
 *   to it.
 */
export function describeError(error: unknown, causesLeft = MAX_CAUSES): string {
  if (!(error instanceof Error)) return typeof error === 'string' ? error : inspect(error, { depth: 2 });

  const name = error.name === 'Error' ? error.constructor.name : error.name;
  const query = failedQuery(error);
  const message = query === null ? error.message : `Failed query: ${query}`;
  const code = plainCode((error as { code?: unknown }).code);
  const frames = framesOf(error);

  const lines = [`${name}: ${message}${code ? ` (code ${code})` : ''}`, ...frames];
  if (error.cause !== undefined && causesLeft > 0) {
    lines.push(`Caused by: ${describeError(error.cause, causesLeft - 1)}`);
  }
  return lines.join('\n');
}

/**
 * Records that the server itself failed. where is the name of the operation that failed, or the address of the
 * request when it failed before reaching an operation.
 * In a running server every reportError is this function (see main.ts).
 */
export function logInternalError(error: unknown, where: string): void {
  console.error(`Request to ${where} failed with an internal error:\n${describeError(error)}`);
}
