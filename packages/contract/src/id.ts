import { z } from 'zod';

/**
 * An id in the input of an operation. Every kind of thing uses this same one.
 * A field of an input that is called id, or whose name ends in Id, must be exactly this: operation() checks it when
 * the operation is defined, so no operation can accept ids in a spelling of its own.
 *
 * Only a lowercase uuid is accepted, so an id has one spelling. A database compares uuids without regard to case,
 * but code compares them as strings ("is this the caller's own?"): accept uppercase, and the same id becomes two
 * different things on the two sides. The ids the server hands out are lowercase already.
 */
export const id = z.uuid().lowercase();
