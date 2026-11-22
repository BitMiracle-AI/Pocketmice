import type { z } from 'zod';
import type { DeclaredErrorCode } from './errors.ts';
import { id } from './id.ts';

/**
 * The name of an operation is a verb followed by a noun, in camelCase: getServerInfo, getTeamMembers. The code, the
 * address and the logs all use this one word.
 * A read always starts with get: singular for one thing, plural for several — never list or query. An operation
 * that changes something uses the verb the product uses, like leaveTeam.
 * At least two words: a one-word name is refused, so the address of an operation can never collide with another
 * entrance under /api/, like /api/health.
 */
const NAME = /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/;

/**
 * The definition of one operation. The server implements it and every caller calls it from this one definition:
 * the shape of an operation is written down once, here.
 * Input and output must both be objects, so a field can be added later without breaking the calls that exist.
 */
export interface Operation<
  Kind extends 'read' | 'write' = 'read' | 'write',
  Input extends z.ZodObject = z.ZodObject,
  Output extends z.ZodObject = z.ZodObject,
  Code extends DeclaredErrorCode = DeclaredErrorCode
> {
  /** The operation's name, like getServerInfo. The constant that exports the definition has the same name */
  readonly name: string;
  /** Read or write. A read changes nothing, so calling it again is always safe */
  readonly kind: Kind;
  readonly input: Input;
  readonly output: Output;
  /**
   * The error codes this operation may answer with. The ones any operation may answer with (see errors.ts) are not
   * listed
   */
  readonly errors: readonly Code[];
}

/**
 * Defines an operation. A definition that is wrong fails here, when the file loads, not when someone calls it:
 * - the name breaks the rule above;
 * - an input field called id, or ending in Id, is not the shared id (see id.ts).
 */
export function operation<
  Kind extends 'read' | 'write',
  Input extends z.ZodObject,
  Output extends z.ZodObject,
  Code extends DeclaredErrorCode = never
>(definition: Operation<Kind, Input, Output, Code>): Operation<Kind, Input, Output, Code> {
  if (!NAME.test(definition.name)) {
    throw new Error(
      `Operation name "${definition.name}" is invalid. Write it as a verb followed by a noun in camelCase, like getServerInfo.`
    );
  }
  for (const [field, schema] of Object.entries(definition.input.shape)) {
    if ((field === 'id' || field.endsWith('Id')) && schema !== id) {
      throw new Error(
        `Operation ${definition.name} takes "${field}" in its input with its own rule. Use the id from @pocketmice/contract/id: an id is accepted in one spelling only.`
      );
    }
  }
  return definition;
}

/**
 * A read. Calling it again is safe, so only its result may be cached or fetched again automatically.
 * Code that should only ever be given a read takes this type: passing it a write fails the type check.
 */
export type ReadOperation = Operation<'read'>;

/** Whether value is the definition of an operation. Used to pick the operations out of what a file exports */
export function isOperation(value: unknown): value is Operation {
  if (typeof value !== 'object' || value === null) return false;
  return ['name', 'kind', 'input', 'output', 'errors'].every((field) => field in value);
}

/**
 * The part of an operation's address after the host, like /api/getServerInfo. Every operation is a POST to it.
 * The server mounts the operation at it and callers send requests to it: how the address is built is decided here
 * only.
 */
export function operationPath(operation: Operation): string {
  return `/api/${operation.name}`;
}

/** The input a caller passes */
export type InputOf<Op extends Operation> = z.input<Op['input']>;
/** The input after the server has checked it: the defaults in the definition are filled in */
export type CheckedInputOf<Op extends Operation> = z.output<Op['input']>;
/** The output */
export type OutputOf<Op extends Operation> = z.output<Op['output']>;
/** The error codes this operation lists */
export type CodeOf<Op extends Operation> = Op['errors'][number];
