import { z } from 'zod';
import type { DeclaredErrorCode } from './errors.ts';
import { id } from './id.ts';
import type { SpaceRole } from './spaceRole.ts';

/**
 * The name of an operation is a verb followed by a noun, in camelCase: getServerInfo, createSpace. The code, the
 * address and the logs all use this one word.
 * A read always starts with get: singular for one thing, plural for several — never list or query. An operation
 * that changes something uses the verb the product uses, like leaveSpace, and never get: operation() refuses a
 * definition whose name and kind disagree.
 * At least two words: a one-word name is refused, so the address of an operation can never collide with another
 * entrance under /api/, like /api/health or /api/auth (the sign-in library).
 */
const NAME = /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/;

/** The name of a read: get, then the noun */
const READ_NAME = /^get[A-Z]/;

/**
 * The definition of one operation. The server implements it and every caller calls it from this one definition:
 * the shape of an operation is written down once, here.
 * Input and output must both be objects, so a field can be added later without breaking the calls that exist.
 */
export interface Operation<
  Kind extends 'read' | 'write' = 'read' | 'write',
  Access extends 'public' | 'authenticated' | 'session' = 'public' | 'authenticated' | 'session',
  BelongsTo extends 'space' | 'none' = 'space' | 'none',
  Input extends z.ZodObject = z.ZodObject,
  Output extends z.ZodObject = z.ZodObject,
  Code extends DeclaredErrorCode = DeclaredErrorCode
> {
  /** The operation's name, like getServerInfo. The constant that exports the definition has the same name */
  readonly name: string;
  /**
   * What the operation does, what it answers with, and what each error code it lists means here: sentences a
   * caller can act on without having read anything else. A model that is offered the operation as a tool (see
   * mcp.ts in the api) reads this and nothing more about it, so it also says what the rest of the contract leaves
   * to a convention, like null for "directly in the space".
   * It is the one place that says so: there is no comment above a definition saying it a second time. Why an
   * operation is the way it is, is for whoever maintains it and stays a comment.
   */
  readonly description: string;
  /**
   * Read or write. A read changes nothing, so calling it again is always safe. An API key that is read-only calls
   * reads only, so a write that said read here would be open to it: the name has to say the same (see NAME).
   */
  readonly kind: Kind;
  /**
   * Who may call it.
   * public: anyone.
   * authenticated: a person the server knows, whichever way it knows them: someone who signed in, or an agent
   * calling with one of that person's API keys.
   * session: a person who signed in themselves; an API key is not enough. It is for whatever decides who can get
   * in (API keys, members, invites) and for what cannot be undone (deleting for good), which an agent does not do
   * on anyone's behalf.
   */
  readonly access: Access;
  /**
   * Whether the operation belongs to a space.
   * space: it reads or writes what is in the space that spaceId in the input names. The caller must be a member of
   * that space, and the server checks so before the implementation runs, rather than trusting every implementation
   * to remember; not a member, or no such space, is UNKNOWN_SPACE.
   * none: it is about the caller alone, or about nothing that is in a space, like "which spaces am I in".
   */
  readonly belongsTo: BelongsTo;
  /**
   * For an operation of a space: the lowest role that may call it (see spaceRole.ts). The server checks it together
   * with the membership; a member whose role is lower is answered FORBIDDEN.
   * An operation that belongs to no space has none.
   */
  readonly minRole?: SpaceRole;
  readonly input: Input;
  readonly output: Output;
  /**
   * The error codes this operation may answer with. The ones any operation may answer with (see errors.ts) are not
   * listed
   */
  readonly errors: readonly Code[];
}

/**
 * The rules an operation of a space keeps besides, written into the types: a definition that breaks one fails the
 * type check where it is written.
 * It is not public: without knowing who is calling, membership cannot be checked. Its input has a spaceId, which
 * says which space. It states the lowest role that may call it.
 * And an operation that belongs to no space states no role: there is no space to have one in.
 */
type SpaceRules<Access, BelongsTo> = BelongsTo extends 'space'
  ? {
      // Not written as the two values that are right: with a wrong access, TypeScript would then judge the whole
      // definition an impossible type and report every field, hiding which one is wrong
      readonly access: Access extends 'public' ? OperationsOfASpaceAreNotPublic : unknown;
      readonly input: z.ZodType<{ spaceId: string }>;
      readonly minRole: SpaceRole;
    }
  : { readonly minRole?: never };

/** Exists only to put this sentence into the type checker's message. No value has this type */
interface OperationsOfASpaceAreNotPublic {
  readonly operationsOfASpaceAreNotPublic: never;
}

/**
 * Defines an operation. A definition that is wrong fails here, when the file loads, not when someone calls it:
 * - the name breaks the rule above;
 * - the name says read (it starts with get) and the kind says write, or the other way round;
 * - the description is empty;
 * - an input field called id, or ending in Id, is not the shared id, nor that id made nullable (see id.ts).
 *
 * The definition it gives back takes the fields its input names and no other, however the input was written: a
 * call with a field the definition does not have is refused (INVALID_INPUT, naming the field), and is not answered
 * as though the field had not been sent. A caller that writes desc for description would otherwise be given a
 * folder with no description, and one that passes nextCursor back under that name, and not as cursor, the first
 * page again for as long as it asks. Whoever writes JSON by hand, as an agent does, is told of the mistake.
 * It is made so here, and not written in every definition, so that no definition can leave it out. The entrances
 * that are not operations write it themselves (z.strictObject).
 */
export function operation<
  Kind extends 'read' | 'write',
  Access extends 'public' | 'authenticated' | 'session',
  BelongsTo extends 'space' | 'none',
  Input extends z.ZodObject,
  Output extends z.ZodObject,
  Code extends DeclaredErrorCode = never
>(
  definition: Operation<Kind, Access, BelongsTo, Input, Output, Code> & SpaceRules<Access, BelongsTo>
): Operation<Kind, Access, BelongsTo, Input, Output, Code> {
  if (!NAME.test(definition.name)) {
    throw new Error(
      `Operation name "${definition.name}" is invalid. Write it as a verb followed by a noun in camelCase, like getServerInfo.`
    );
  }
  if (READ_NAME.test(definition.name) !== (definition.kind === 'read')) {
    throw new Error(
      `Operation ${definition.name} is a ${definition.kind}, and its name says otherwise. A read is named get…, and nothing else is.`
    );
  }
  if (definition.description.trim() === '') {
    throw new Error(
      `Operation ${definition.name} has no description. Say what it does: a caller that is offered it as a tool reads nothing else about it.`
    );
  }
  for (const [field, schema] of Object.entries(definition.input.shape)) {
    if ((field === 'id' || field.endsWith('Id')) && !isSharedId(schema)) {
      throw new Error(
        `Operation ${definition.name} takes "${field}" in its input with its own rule. Use the id from @pocketmice/contract/id, or id.nullable(): an id is accepted in one spelling only.`
      );
    }
  }
  // The fields and their types stay what they were, which is all the type of an input says
  return { ...definition, input: definition.input.strict() as Input };
}

/** Whether a field of an input is the shared id, or the shared id made nullable: an id, or null for "none" */
function isSharedId(schema: unknown): boolean {
  return schema === id || (schema instanceof z.ZodNullable && schema.unwrap() === id);
}

/** Whether value is the definition of an operation. Used to pick the operations out of what a file exports */
export function isOperation(value: unknown): value is Operation {
  if (typeof value !== 'object' || value === null) return false;
  return ['name', 'description', 'kind', 'access', 'belongsTo', 'input', 'output', 'errors'].every(
    (field) => field in value
  );
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
