import { z } from 'zod';
import { id } from '../id.ts';
import { operation } from '../operation.ts';
import { grantableRole, spaceRole } from '../spaceRole.ts';

// Spaces. A space is the container everything in the drive belongs to, together with its members: whoever is a
// member can get in, and nobody else can. What a member may do there is decided by their role (see spaceRole.ts).
// Someone can be a member of many spaces, and of none: the server never makes a space for anyone.
// "Space" always means this container. Storage is where the bytes are kept; how many bytes something is, is its
// size; and the most that may be kept, where the owner of a space has said so, is a storage limit.
// How someone becomes a member of a space they did not make is in invite.ts.
//
// Storage limits. The owner of a space can limit how much the space holds, and how much each member holds in it.
// - What a space holds is every version of every file in it: the versions before the current one and what is in
//   the trash too, because all of that is kept. What a member holds is the versions they wrote, themselves or
//   through an API key of theirs: a limit on a member holds that member's agents as well.
// - A limit is asked about when bytes are to be added: by an upload, and by bringing an old version back. What
//   would take the space past its limit is refused with SPACE_STORAGE_LIMIT_EXCEEDED, what would take the caller
//   past their own with MEMBER_STORAGE_LIMIT_EXCEEDED, and both before any of the bytes are taken. Nothing else
//   is refused: what is in a space over its limit is still read, renamed, moved, trashed and deleted.
// - It is not exact. A write is held against what is kept at the moment it begins, so writes that are under way
//   at the same time do not count each other: together they can take a space, or a member, past a limit by as
//   much as they add (twenty uploads sent at once into a space with room for three were all taken, when it was
//   tried). Nothing more goes in after that. Writes sent one after another are held exactly.
// - Room is made by what removes bytes: deleting for good and emptying the trash, which are the owner's (see
//   file.ts). A member who has reached their limit cannot make room themselves, since the trash keeps what is
//   put in it: they ask the owner, who makes room or raises the limit.
// - A limit is set by the owner, signed in themselves, and by no API key. A limit holds agents too, and an agent
//   that could raise it would not be held by it.
// - A limit holds one space, and not the server. Whoever may make a space makes one that has no limit, an agent
//   with a key that writes included (createSpace): how much a person, or the server in all, holds is not limited.
// - The limit of a member is theirs for as long as they are a member. One who leaves and joins again has the
//   limit of the invite they join with (see invite.ts).

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

/**
 * A storage limit: the most that may be kept, in bytes. Null is no limit. Zero is a limit: nothing may be added.
 */
export const storageLimit = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();

/** How much a space holds, and the most it may */
const spaceSize = z.object({
  /** The bytes of every version of every file in the space */
  storageSize: z.number(),
  /** The most the space may hold. Null when its owner has set no limit */
  storageLimit
});

/** A member of a space, as the other members see them */
const member = z.object({
  userId: z.string(),
  /** The name they go by */
  name: z.string(),
  role: spaceRole,
  /** The bytes they hold in the space: every version they wrote, themselves or through an API key of theirs */
  storageSize: z.number(),
  /** The most they may hold there. Null when the owner has set no limit for them */
  storageLimit
});

export const getSpaces = operation({
  name: 'getSpaces',
  description:
    "The spaces the caller is a member of, the oldest first, each with the caller's role in it. Empty for " +
    'someone who is in none.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'none',
  input: z.object({}),
  output: z.object({ spaces: z.array(space) }),
  errors: []
});

export const createSpace = operation({
  name: 'createSpace',
  description: 'Makes a space. The caller is its owner and, to begin with, its only member. Answers with the space.',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'none',
  input: z.object({ name: spaceName }),
  output: z.object({ space }),
  errors: []
});

// An API key of the owner may do it too: a new name lets nobody in and can be changed back.
export const updateSpace = operation({
  name: 'updateSpace',
  description:
    'Changes the name of a space. Answers with the space as it is after the change. The name is what every ' +
    "member finds the space under, so it is the owner's to change.",
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'owner',
  input: z.object({ spaceId: id, name: spaceName }),
  output: z.object({ space }),
  errors: []
});

export const getSpaceSize = operation({
  name: 'getSpaceSize',
  description:
    'How much a space holds, and the most it may. storageSize is the bytes of every version of every file in ' +
    'it, the versions before the current one and what is in the trash included: all of that is kept. ' +
    'storageLimit is the most the space may hold, in bytes, or null when its owner has set no limit. An upload ' +
    'that would take the space past it is refused with SPACE_STORAGE_LIMIT_EXCEEDED, and then only the owner ' +
    'can help: by deleting files for good, or by raising the limit. What each member holds, and the most each ' +
    'may, is in getMembers.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id }),
  output: spaceSize,
  errors: []
});

// Setting a limit, this one and a member's below, is for the owner signed in and for no API key: see "Storage
// limits" at the top.
export const updateSpaceStorageLimit = operation({
  name: 'updateSpaceStorageLimit',
  description:
    'Sets the most a space may hold, in bytes; null takes the limit away. Answers as getSpaceSize does, with ' +
    'the limit as it is after the change. A limit under what the space holds already is taken as it is: ' +
    'nothing is removed, and nothing more goes in until there is room.',
  kind: 'write',
  access: 'session',
  belongsTo: 'space',
  minRole: 'owner',
  input: z.object({ spaceId: id, storageLimit }),
  output: spaceSize,
  errors: []
});

export const getMembers = operation({
  name: 'getMembers',
  description:
    'The members of a space, in the order they became members, each with their role there, the bytes they ' +
    'hold in the space (storageSize: every version they wrote, themselves or through an API key of theirs, the ' +
    'versions before the current one and what is in the trash included) and the most they may hold ' +
    '(storageLimit, null when the owner has set no limit for them). An upload that would take a member past ' +
    'their limit is refused with MEMBER_STORAGE_LIMIT_EXCEEDED. What they hold need not add up to what ' +
    'getSpaceSize answers: what someone wrote who is no longer a member stays in the space, and is not listed.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id }),
  output: z.object({ members: z.array(member) }),
  errors: []
});

export const updateMember = operation({
  name: 'updateMember',
  description:
    'Changes the role of a member. Answers with the member as they are after the change. NOT_FOUND: the space ' +
    'has no such member. CONFLICT: the member is the owner, whose role does not change.',
  kind: 'write',
  access: 'session',
  belongsTo: 'space',
  minRole: 'owner',
  input: z.object({ spaceId: id, userId: id, role: grantableRole }),
  output: z.object({ member }),
  errors: ['NOT_FOUND', 'CONFLICT']
});

export const updateMemberStorageLimit = operation({
  name: 'updateMemberStorageLimit',
  description:
    'Sets the most a member may hold in a space, in bytes; null takes the limit away. Answers with the member ' +
    'as they are after the change. The member may be the owner: the limit then holds the owner, and the ' +
    "agents that write with the owner's API keys. A limit under what the member holds already is taken as it " +
    'is. NOT_FOUND: the space has no such member.',
  kind: 'write',
  access: 'session',
  belongsTo: 'space',
  minRole: 'owner',
  input: z.object({ spaceId: id, userId: id, storageLimit }),
  output: z.object({ member }),
  errors: ['NOT_FOUND']
});

export const removeMember = operation({
  name: 'removeMember',
  description:
    'Takes a member out of a space. From then on the space does not exist for them, nor for an agent calling ' +
    'with one of their API keys, unless they join again with an invite that still works. NOT_FOUND: the space ' +
    'has no such member. CONFLICT: the member is the owner, who cannot be removed.',
  kind: 'write',
  access: 'session',
  belongsTo: 'space',
  minRole: 'owner',
  input: z.object({ spaceId: id, userId: id }),
  output: z.object({}),
  errors: ['NOT_FOUND', 'CONFLICT']
});

export const deleteSpace = operation({
  name: 'deleteSpace',
  description:
    'Deletes a space for good: its files with every version of them, its conversations, its members and its ' +
    'invites. Nothing brings it back, so it is for the owner, signed in themselves.',
  kind: 'write',
  access: 'session',
  belongsTo: 'space',
  minRole: 'owner',
  input: z.object({ spaceId: id }),
  output: z.object({}),
  errors: []
});

export const leaveSpace = operation({
  name: 'leaveSpace',
  description:
    'The caller stops being a member of a space. CONFLICT: the caller is the owner, who cannot leave: the ' +
    'space would be left with nobody to decide who is in it.',
  kind: 'write',
  access: 'session',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id }),
  output: z.object({}),
  errors: ['CONFLICT']
});
