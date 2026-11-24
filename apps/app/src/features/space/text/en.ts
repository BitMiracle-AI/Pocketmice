import type { SpaceRole } from '@pocketmice/contract/spaceRole';

/** The sentences about spaces, in English. This file says which sentences there are */
export const en = {
  roles: { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' } satisfies Record<SpaceRole, string>,
  spacesTitle: 'Spaces',
  spacesLabel: 'Your spaces',
  newSpace: 'New space',
  dialogTitle: 'New space',
  /** What a space is, in one line: under the title of the start, and of the dialog a space is made in */
  whatASpaceIs: 'A space is a set of files and the people who can get in.',
  nameLabel: 'Name',
  namePlaceholder: 'Product research',
  nameMissing: 'Give the space a name.',
  create: 'Create space',
  cancel: 'Cancel',
  firstTitle: 'Create your first space',
  firstDescription:
    'A space is a set of files and the people who can get in. You can make more later, and invite people to each.',
  /** What each role that can be given may do, under its name where one is chosen */
  roleHints: {
    editor: 'Adds, changes and deletes files.',
    viewer: 'Opens and downloads files, and changes nothing.'
  } satisfies Record<Exclude<SpaceRole, 'owner'>, string>,

  /** Under the title of the members: who they are, and who decides */
  membersHints: {
    owner: 'The people who can get into this space, and what each may do. You decide both.',
    editor: 'The people who can get into this space, and what each may do. The owner decides both.',
    viewer: 'The people who can get into this space, and what each may do. The owner decides both.'
  } satisfies Record<SpaceRole, string>,
  membersLabel: 'The members of this space',
  you: 'You',
  changeRole: (name: string) => `Change the role of ${name}`,
  removeMember: 'Remove from space',
  removeTitle: (name: string) => `Remove ${name} from this space?`,
  removeDescription:
    'They will no longer see anything in it, and neither will an agent calling with one of their API keys. They can come back with an invite link that still works.',
  remove: 'Remove',
  memberGone: 'They are no longer a member of this space.',
  ownerStays: 'The role of the owner cannot be changed, and the owner cannot be removed.',
  leave: 'Leave space',
  leaveTitle: (name: string) => `Leave “${name}”?`,
  leaveDescription:
    'You will no longer see anything in it, and neither will an agent calling with one of your API keys. To come back you need an invite link from the owner.',
  ownerCannotLeave: 'The owner of a space cannot leave it.',
  left: (name: string) => `You left “${name}”`,

  settingsTitle: 'Space settings',
  settingsOwnerOnly: 'Only the owner of this space can rename it, set its storage limit or delete it.',
  renameHint: 'Every member finds the space under this name.',
  renamed: 'Space renamed',
  deleteSpaceTitle: 'Delete this space',
  deleteSpaceHint:
    'Every file in it is deleted with every version, and so are its members and its invite links. Nothing brings it back.',
  deleteSpace: 'Delete space',
  deleteSpaceAsk: (name: string) => `Delete “${name}”?`,
  deleteSpaceTypeLabel: 'Type the name of the space to confirm',
  deletedSpace: (name: string) => `Deleted “${name}”`,

  storageTitle: 'Storage',
  /** How much the space holds, in a sentence: with no limit, and against its limit */
  spaceHolds: (size: string) => `This space holds ${size}, and has no storage limit.`,
  spaceHoldsOf: (size: string, limit: string) => `This space holds ${size} of ${limit}.`,
  /** How much a member holds, under their name: with no limit, and against their limit */
  holds: (size: string) => `Holds ${size}`,
  holdsOf: (size: string, limit: string) => `Holds ${size} of ${limit}`,
  limitLabel: 'Storage limit',
  /** What the empty field of a limit says */
  noLimit: 'No limit',
  limitUnit: 'Unit',
  spaceLimitHint:
    'The most this space may hold. Every version of every file counts, the versions before the current one and what is in the trash too. Leave it empty for no limit.',
  limitInvalid: 'Type an amount like 10 or 1.5, or leave it empty for no limit.',
  limitSaved: 'Storage limit saved',
  storageLimitItem: 'Storage limit',
  moreFor: (name: string) => `More for ${name}`,
  memberLimitTitle: (name: string) => `Storage limit of ${name}`,
  memberHoldsNow: (name: string, size: string) => `${name} holds ${size} in this space now.`,
  memberLimitHint:
    'The most this member may hold in the space: every version they wrote, themselves or through one of their API keys, the versions before the current one and what is in the trash too. Leave it empty for no limit.',

  unknownTitle: 'No such space',
  unknownDescription: 'There is no space at this address, or you are not a member of it.'
};
