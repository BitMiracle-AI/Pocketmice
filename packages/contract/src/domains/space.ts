import { z } from 'zod';
import { id } from '../id.ts';
import { operation } from '../operation.ts';
import { grantableRole, spaceRole } from '../spaceRole.ts';

// Spaces. A space is the container everything in the drive belongs to, together with its members: whoever is a
// member can get in, and nobody else can. What a member may do there is decided by their role (see spaceRole.ts).
// Someone can be a member of many spaces, and of none: the server never makes a space for anyone.
// "Space" always means this container. How many bytes something is, is its size; the most a space may hold, when
// there is such a limit, is its quota; and storage is where the bytes are kept.
// How someone becomes a member of a space they did not make is in invite.ts.

/** The name of a space has at most this many characters */
export const SPACE_NAME_MAX_LENGTH = 50;

/** The name of a space. Spaces around it are dropped; it is not empty. Two spaces may have the same name */
export const spaceName = z.string().trim().min(1).max(SPACE_NAME_MAX_LENGTH);

/** A space, as one of its members sees it */
export const space = z.object({
  id: z.string(),
  name: z.string(),
  /** The caller's own role in it */
  role: spaceRole
});

/** A member of a space, as the other members see them */
const member = z.object({
  userId: z.string(),
  /** The name they go by */
  name: z.string(),
  role: spaceRole
});

/** The spaces the caller is a member of, the oldest first. Empty for someone who is in none */
export const getSpaces = operation({
  name: 'getSpaces',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'none',
  input: z.object({}),
  output: z.object({ spaces: z.array(space) }),
  errors: []
});

/** Makes a space. The caller is its owner and, to begin with, its only member */
export const createSpace = operation({
  name: 'createSpace',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'none',
  input: z.object({ name: spaceName }),
  output: z.object({ space }),
  errors: []
});

/**
 * Changes the name of a space. Answers with the space as it is after the change.
 * The name is what every member finds the space under, so it is the owner's to change. An API key of the owner may
 * do it too: a new name lets nobody in and can be changed back.
 */
export const updateSpace = operation({
  name: 'updateSpace',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'owner',
  input: z.object({ spaceId: id, name: spaceName }),
  output: z.object({ space }),
  errors: []
});

/** The members of a space, in the order they became members */
export const getMembers = operation({
  name: 'getMembers',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id }),
  output: z.object({ members: z.array(member) }),
  errors: []
});

/**
 * Changes the role of a member. Answers with the member as they are after the change.
 * NOT_FOUND: the space has no such member. CONFLICT: the member is the owner, whose role does not change.
 */
export const updateMember = operation({
  name: 'updateMember',
  kind: 'write',
  access: 'session',
  belongsTo: 'space',
  minRole: 'owner',
  input: z.object({ spaceId: id, userId: id, role: grantableRole }),
  output: z.object({ member }),
  errors: ['NOT_FOUND', 'CONFLICT']
});

/**
 * Takes a member out of a space. From then on the space does not exist for them, nor for an agent calling with
 * one of their API keys — unless they join again with an invite that still works (see invite.ts).
 * NOT_FOUND: the space has no such member. CONFLICT: the member is the owner, who cannot be removed.
 */
export const removeMember = operation({
  name: 'removeMember',
  kind: 'write',
  access: 'session',
  belongsTo: 'space',
  minRole: 'owner',
  input: z.object({ spaceId: id, userId: id }),
  output: z.object({}),
  errors: ['NOT_FOUND', 'CONFLICT']
});

/**
 * Deletes a space for good: its files with every version of them, its members and its invites. Nothing brings it
 * back, so it is for the owner, signed in themselves.
 */
export const deleteSpace = operation({
  name: 'deleteSpace',
  kind: 'write',
  access: 'session',
  belongsTo: 'space',
  minRole: 'owner',
  input: z.object({ spaceId: id }),
  output: z.object({}),
  errors: []
});

/**
 * The caller stops being a member of a space.
 * CONFLICT: the caller is the owner, who cannot leave: the space would be left with nobody to decide who is in it.
 */
export const leaveSpace = operation({
  name: 'leaveSpace',
  kind: 'write',
  access: 'session',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id }),
  output: z.object({}),
  errors: ['CONFLICT']
});
