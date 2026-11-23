import type { SpaceRole } from '@pocketmice/contract/spaceRole';

/** The sentences about spaces, in English. This file says which sentences there are */
export const en = {
  roles: { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' } satisfies Record<SpaceRole, string>,
  listLabel: 'Spaces',
  switchSpace: 'Switch space',
  newSpace: 'New space',
  dialogTitle: 'New space',
  /** What a space is, in one line: under the title of the dialog */
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

  unknownTitle: 'No such space',
  unknownDescription: 'There is no space at this address, or you are not a member of it.',
  toHome: 'Go to your files'
};
