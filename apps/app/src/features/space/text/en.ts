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
  unknownTitle: 'No such space',
  unknownDescription: 'There is no space at this address, or you are not a member of it.',
  toHome: 'Go to your files'
};
