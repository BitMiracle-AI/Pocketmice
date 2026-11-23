import { getMembers, leaveSpace, removeMember, updateMember } from '@pocketmice/contract/domains/space';
import type { InputOf, OutputOf } from '@pocketmice/contract/operation';
import { invitesQuery } from '@/features/invite/invites';
import { call, failureText, queryClient, readQuery, spaceChanged } from '@/lib/api';
import { spacesQuery } from './spaces';
import { spaceText } from './text';

// The members of a space: whoever is one can get in, and what they may do there is their role. Every member sees
// who the others are. The owner alone changes a role or takes someone out; anyone but the owner can leave.

/** A member of a space, as the other members see them */
export type Member = OutputOf<typeof getMembers>['members'][number];

/** A role that can be given to someone: every role but owner */
export type GrantableRole = InputOf<typeof updateMember>['role'];

/** The members of a space, in the order they became members */
export function membersQuery(spaceId: string) {
  return readQuery(getMembers, { spaceId });
}

/**
 * What the page of the members needs before it is shown: the members, and for the owner the invites to the space,
 * which nobody else may read.
 */
export async function loadMembers(spaceId: string): Promise<void> {
  const [{ spaces }] = await Promise.all([
    queryClient.ensureQueryData(spacesQuery),
    queryClient.ensureQueryData(membersQuery(spaceId))
  ]);
  if (spaces.find((each) => each.id === spaceId)?.role === 'owner') {
    await queryClient.ensureQueryData(invitesQuery(spaceId));
  }
}

/** Changes the role of a member. Null when it is changed, or the sentence that says why it is not */
export async function changeRole(spaceId: string, userId: string, role: GrantableRole): Promise<string | null> {
  const result = await call(updateMember, { spaceId, userId, role });
  spaceChanged(spaceId);
  if (result.ok) return null;
  return failureText(result.code, { NOT_FOUND: spaceText.memberGone, CONFLICT: spaceText.ownerStays });
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
 * The list of spaces still has it: the page that asked is one of that space, and leaves it first (noLongerIn).
 */
export async function leave(spaceId: string): Promise<string | null> {
  const result = await call(leaveSpace, { spaceId });
  if (!result.ok && result.code !== 'UNKNOWN_SPACE') {
    return failureText(result.code, { CONFLICT: spaceText.ownerCannotLeave });
  }
  return null;
}
