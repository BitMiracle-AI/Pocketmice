import { z } from 'zod';
import { id } from '../id.ts';
import { operation } from '../operation.ts';
import { grantableRole } from '../spaceRole.ts';
import { space } from './space.ts';

// Invites: how someone becomes a member of a space they did not make.
// The owner of a space makes an invite, which says what role it gives, and hands its link to the people they want
// in. Whoever is signed in and has the link can join, as many people as have it, until the invite expires or the
// owner deletes it. Nothing is emailed, and nobody is put into a space without doing something themselves.
// The link carries the id of the invite, and the id is all it takes to join: an invite's id is a secret between
// the owner and the people the link was given to.

/** An invite works for this many days after it was made */
export const INVITE_LIFETIME_DAYS = 7;

/** An invite, as the owner of the space sees it */
const invite = z.object({
  /** What the link carries */
  id: z.string(),
  /** The role it gives to whoever joins with it */
  role: grantableRole,
  /** When it stops working: an ISO 8601 time in UTC */
  expiresAt: z.iso.datetime()
});

/** Makes an invite to a space */
export const createInvite = operation({
  name: 'createInvite',
  kind: 'write',
  access: 'session',
  belongsTo: 'space',
  minRole: 'owner',
  input: z.object({ spaceId: id, role: grantableRole }),
  output: z.object({ invite }),
  errors: []
});

/** The invites to a space that still work, the oldest first */
export const getInvites = operation({
  name: 'getInvites',
  kind: 'read',
  access: 'session',
  belongsTo: 'space',
  minRole: 'owner',
  input: z.object({ spaceId: id }),
  output: z.object({ invites: z.array(invite) }),
  errors: []
});

/**
 * Deletes an invite: its link stops working. Whoever joined with it stays a member.
 * NOT_FOUND: the space has no such invite.
 */
export const deleteInvite = operation({
  name: 'deleteInvite',
  kind: 'write',
  access: 'session',
  belongsTo: 'space',
  minRole: 'owner',
  input: z.object({ spaceId: id, inviteId: id }),
  output: z.object({}),
  errors: ['NOT_FOUND']
});

/**
 * The caller joins the space an invite is to, in the role the invite gives. Answers with the space.
 * Someone who is a member already stays in the role they have.
 * NOT_FOUND: there is no such invite, or it has expired.
 */
export const joinSpace = operation({
  name: 'joinSpace',
  kind: 'write',
  access: 'session',
  belongsTo: 'none',
  input: z.object({ inviteId: id }),
  output: z.object({ space }),
  errors: ['NOT_FOUND']
});
