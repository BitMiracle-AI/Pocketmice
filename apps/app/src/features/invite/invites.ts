import { createInvite, deleteInvite, getInvites, joinSpace } from '@pocketmice/contract/domains/invite';
import type { OutputOf } from '@pocketmice/contract/operation';
import { nowIn, type Space } from '@/features/space/spaces';
import { call, failureText, readQuery, spaceChanged } from '@/lib/api';

// Invites: how someone becomes a member of a space they did not make. The owner makes an invite, which says what
// role it gives, and hands its link to the people they want in; whoever is signed in and opens the link can join.
// The link carries the id of the invite and nothing else, and the id is all it takes: it is shown to the owner of
// the space alone.

/** An invite, as the owner of the space sees it */
export type Invite = OutputOf<typeof getInvites>['invites'][number];

/** The invites to a space that still work, the oldest first. For the owner: nobody else may read them */
export function invitesQuery(spaceId: string) {
  return readQuery(getInvites, { spaceId });
}

/** The link of an invite: the address of this app that whoever opens it joins at */
export function inviteLink(inviteId: string): string {
  return new URL(`/join/${inviteId}`, window.location.origin).href;
}

/** Makes an invite that gives role. Answers with it, or with the sentence that says why it was not made */
export async function makeInvite(
  spaceId: string,
  role: Invite['role']
): Promise<{ invite: Invite } | { problem: string }> {
  const result = await call(createInvite, { spaceId, role });
  if (!result.ok) return { problem: failureText(result.code, {}) };
  spaceChanged(spaceId);
  return { invite: result.data.invite };
}

/**
 * Deletes an invite: its link stops working. Null when it is gone, or the sentence that says why it is not. One
 * that turns out to be gone already (it expired a moment ago) is gone, which is what was asked for.
 */
export async function removeInvite(spaceId: string, inviteId: string): Promise<string | null> {
  const result = await call(deleteInvite, { spaceId, inviteId });
  spaceChanged(spaceId);
  return result.ok || result.code === 'NOT_FOUND' ? null : failureText(result.code, {});
}

/**
 * The person joins the space an invite is to. Answers with the space, which is in their list of spaces from then
 * on. dead says the invite does not work: there is none with that id, or it has expired. Anything else that went
 * wrong is said in problem, and joining can be tried again.
 */
export async function joinWith(inviteId: string): Promise<{ space: Space } | { dead: true } | { problem: string }> {
  const result = await call(joinSpace, { inviteId });
  if (!result.ok) {
    return result.code === 'NOT_FOUND' ? { dead: true } : { problem: failureText(result.code, {}) };
  }
  nowIn(result.data.space);
  return { space: result.data.space };
}
