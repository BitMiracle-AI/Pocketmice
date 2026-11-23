import { z } from 'zod';

/**
 * The roles a member of a space can have, from the one that may do the least to the one that may do the most:
 * - viewer sees what is in the space and changes nothing;
 * - editor also changes what is in the space;
 * - owner also decides what the space is called and who is in it. A space has exactly one owner.
 * The order is the rule: a role may do whatever a role before it in this list may. Every operation of a space
 * states the lowest role that may call it (minRole in its definition).
 */
export const SPACE_ROLES = ['viewer', 'editor', 'owner'] as const;

export type SpaceRole = (typeof SPACE_ROLES)[number];

export const spaceRole = z.enum(SPACE_ROLES);

/**
 * A role that can be given to someone: by an invite, or by changing a member's role. owner is not among them: who
 * owns a space is settled when it is made.
 */
export const grantableRole = spaceRole.exclude(['owner']);

/** Whether a member whose role is held may do what takes the role needed */
export function roleCovers(held: SpaceRole, needed: SpaceRole): boolean {
  return SPACE_ROLES.indexOf(held) >= SPACE_ROLES.indexOf(needed);
}
