import { z } from 'zod';
import { operation } from '../operation.ts';

// Spaces. A space is the container everything in the drive belongs to, together with its members: whoever is a
// member can get in, and nobody else can. Whether someone may see or change what is in a space is decided by that
// one fact.
// Someone can be a member of many spaces, and of none: the server never makes a space for anyone.
// "Space" always means this container. The room that files take up is called storage.

/** The name of a space has at most this many characters */
export const SPACE_NAME_MAX_LENGTH = 50;

/** The name of a space. Spaces around it are dropped; it is not empty. Two spaces may have the same name */
export const spaceName = z.string().trim().min(1).max(SPACE_NAME_MAX_LENGTH);

/** A space, as one of its members sees it */
const space = z.object({ id: z.string(), name: z.string() });

/** The spaces the caller is a member of, the oldest first. Empty for someone who is in none */
export const getSpaces = operation({
  name: 'getSpaces',
  kind: 'read',
  access: 'signed-in',
  belongsTo: 'none',
  input: z.object({}),
  output: z.object({ spaces: z.array(space) }),
  errors: []
});

/** Makes a space. The caller is its owner and, to begin with, its only member */
export const createSpace = operation({
  name: 'createSpace',
  kind: 'write',
  access: 'signed-in',
  belongsTo: 'none',
  input: z.object({ name: spaceName }),
  output: z.object({ space }),
  errors: []
});
