import type { SpaceRole } from '@pocketmice/contract/spaceRole';

/** The sentences about invites, in English. This file says which sentences there are */
export const en = {
  title: 'Invite links',
  hint: 'Whoever is signed in and has a link can join, as many people as have it, until it expires or you delete it. That includes someone you removed: to keep a person out, delete the links they may have.',
  newLink: 'New invite link',
  listLabel: 'The invite links to this space',
  empty: 'No invite links. Create one and send it to the people you want in.',
  joinsAs: {
    editor: 'Joins as an editor',
    viewer: 'Joins as a viewer'
  } satisfies Record<Exclude<SpaceRole, 'owner'>, string>,
  expires: (date: string) => `Expires ${date}`,
  created: 'Invite link created',
  copyLink: 'Copy link',
  copyOf: 'Copy the invite link',
  copyFailed: 'The browser did not let the link be copied. Select it and copy it by hand.',
  remove: 'Delete',
  removeOf: 'Delete the invite link',
  deleteTitle: 'Delete this invite link?',
  deleteDescription: 'The link stops working right away. Whoever joined with it stays a member.',
  cancel: 'Cancel',

  joinTitle: 'Join a space',
  joinDescription:
    'This link invites you to a space on Pocketmice: a set of files, and the people who can get in. Which space it is shows once you have joined.',
  join: 'Join',
  joined: (name: string) => `You joined “${name}”`,
  otherAccount: 'Use another account',
  deadTitle: 'This invite link does not work',
  deadDescription: 'It has expired, or the owner of the space deleted it. Ask them for a new one.',
  toHome: 'Go to your files'
};
