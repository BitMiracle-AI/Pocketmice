import {
  getMembers,
  leaveSpace,
  removeMember,
  updateMember,
  updateMemberStorageLimit
} from '@pocketmice/contract/domains/space';
import type { InputOf, OutputOf } from '@pocketmice/contract/operation';
import { call, failureText, readQuery, spaceChanged } from '@/lib/api';
import { spaceText } from './text';

// The members of a space: whoever is one can get in, and what they may do there is their role. Every member sees
// who the others are, and how much of the space each holds. The owner alone changes a role, sets how much someone
// may hold, or takes someone out; anyone but the owner can leave.

/** A member of a space, as the other members see them */
export type Member = OutputOf<typeof getMembers>['members'][number];

/** A role that can be given to someone: every role but owner */
export type GrantableRole = InputOf<typeof updateMember>['role'];

/** The members of a space, in the order they became members */
export function membersQuery(spaceId: string) {
  return readQuery(getMembers, { spaceId });
}

/** Changes the role of a member. Null when it is changed, or the sentence that says why it is not */
export async function changeRole(spaceId: string, userId: string, role: GrantableRole): Promise<string | null> {
  const result = await call(updateMember, { spaceId, userId, role });
  spaceChanged(spaceId);
  if (result.ok) return null;
  return failureText(result.code, { NOT_FOUND: spaceText.memberGone, CONFLICT: spaceText.ownerStays });
}

/**
 * Sets the most a member may hold in a space, in bytes; null takes the limit away. Null when it is set, or the
 * sentence that says why it is not.
 */
export async function setMemberLimit(
  spaceId: string,
  userId: string,
  storageLimit: number | null
): Promise<string | null> {
  const result = await call(updateMemberStorageLimit, { spaceId, userId, storageLimit });
  spaceChanged(spaceId);
  if (result.ok) return null;
  return failureText(result.code, { NOT_FOUND: spaceText.memberGone });
}

/**
 * Takes a member out of a space. Null when they are out, or the sentence that says why they are not. Someone who
 * turns out to be out already is out, which is what was asked for.
 */
export async function removeFromSpace(spaceId: string, userId: string): Promise<string | null> {
  const result = await call(removeMember, { spaceId, userId });
  spaceChanged(spaceId);
  if (result.ok || result.code === 'NOT_FOUND') return null;
  return failureText(result.code, { CONFLICT: spaceText.ownerStays });
}

/**
 * The person leaves a space. Null when they are out of it, or the sentence that says why they are not. Someone
 * who turns out to be no member any more (the owner removed them a moment ago) is out too.
 * The list of spaces still has it: the page that asked is one of that space, and leaves it first (useNoLongerIn).
 */
export async function leave(spaceId: string): Promise<string | null> {
  const result = await call(leaveSpace, { spaceId });
  if (!result.ok && result.code !== 'UNKNOWN_SPACE') {
    return failureText(result.code, { CONFLICT: spaceText.ownerCannotLeave });
  }
  return null;
}
