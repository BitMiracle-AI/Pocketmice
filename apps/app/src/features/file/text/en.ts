import type { SpaceRole } from '@pocketmice/contract/spaceRole';

/** The sentences of the pages that show files, in English. This file says which sentences there are */
export const en = {
  upload: 'Upload',
  newFolder: 'New folder',
  viewOnly: 'View only',
  viewOnlyHint: 'You are a viewer in this space: you can open and download, and not change anything.',
  name: 'Name',
  writtenBy: 'Last written by',
  modified: 'Modified',
  size: 'Size',
  /** Said of a file an agent wrote: whose API key it wrote through, and what the key is called */
  viaKey: (person: string, key: string) => `Written by an agent, with ${person}'s API key “${key}”.`,
  /** How many folders and files a folder holds. Empty when it holds none */
  summary: (folders: number, files: number) =>
    [
      folders > 0 && (folders === 1 ? '1 folder' : `${folders} folders`),
      files > 0 && (files === 1 ? '1 file' : `${files} files`)
    ]
      .filter(Boolean)
      .join(', '),
  emptyFolder: 'This folder is empty',
  emptySpace: 'No files yet',
  emptyHint: 'Upload files here, or let an agent write them.',
  emptyHintViewer: 'Nothing has been put here yet.',
  download: (name: string) => `Download ${name}`,
  fileGone: 'That file is no longer here.',
  /** Said of a file or a folder that something was asked of, and that is gone: renamed away, moved, or trashed */
  itemGone: 'It is no longer here.',

  /** What the button at the end of a row is called, for whoever cannot see its three dots */
  more: (name: string) => `More about ${name}`,
  rename: 'Rename',
  addDescription: 'Add description',
  editDescription: 'Edit description',
  move: 'Move',
  toTrash: 'Move to trash',

  renameTitle: 'Rename',
  renameSave: 'Rename',
  describeTitle: (name: string) => `Describe “${name}”`,
  describeHint: 'What it holds, where it came from, what to do with it. People and agents both read it.',
  describeLabel: 'Description',
  save: 'Save',

  moveTitle: (name: string) => `Move “${name}”`,
  moveUp: 'Up one folder',
  moveNoFolders: 'There are no folders in here.',
  moveAlreadyHere: 'It is in this folder now.',
  moveTaken: (name: string) => `This folder already has something called “${name}”.`,
  moveConflict: 'It cannot be moved here: the name is taken, or folders would nest too deep.',
  moveGone: 'It, or the folder it was going into, is no longer here.',
  moveHere: 'Move here',
  moved: (name: string, folder: string) => `Moved “${name}” to “${folder}”`,

  trashed: (name: string) => `Moved “${name}” to the trash`,
  undo: 'Undo',
  restoreConflict: 'It could not be put back: its name is taken where it was, or the folder it was in is in the trash.',
  restoreGone: 'It is no longer in the trash.',

  /** Under the title of the trash: what is there, and what the person may do with it */
  trashHints: {
    owner: 'What was deleted from this space. It stays here until you delete it for good.',
    editor: 'What was deleted from this space. You can put it back; only the owner can delete it for good.',
    viewer: 'What was deleted from this space. An editor can put it back.'
  } satisfies Record<SpaceRole, string>,
  trashEmptyTitle: 'The trash is empty',
  trashEmptyHint: 'What is deleted from this space comes here, and can be put back.',
  wasIn: 'Was in',
  deleted: 'Deleted',
  restore: (name: string) => `Put ${name} back`,
  restored: (name: string) => `Put “${name}” back`,
  show: 'Show',
  deleteForGood: (name: string) => `Delete ${name} for good`,
  deleteTitle: (name: string) => `Delete “${name}” for good?`,
  deleteFileHint: 'Every version of it is deleted. Nothing brings it back.',
  deleteFolderHint: 'Everything in it is deleted, with every version of every file. Nothing brings it back.',
  deleteConfirm: 'Delete for good',
  emptyTrash: 'Empty trash',
  emptyTrashTitle: 'Empty the trash?',
  emptyTrashHint:
    'Everything in the trash of this space is deleted for good, with every version of every file. Nothing brings it back.',
  showMore: 'Show more',

  searchLabel: 'Search this space',
  searchPlaceholder: 'Words from a name or a description',
  searchClear: 'Clear',
  searchStartTitle: 'Look for a file or a folder by words',
  searchStartHint:
    'Every word has to be in its name or in its description, in capitals or not. What a file holds is not looked at, and neither are the names of the folders it is in.',
  searchNothingTitle: (words: string) => `Nothing matches “${words}”`,
  searchNothingHint:
    'Every word has to be in the name or the description of a file or a folder. Fewer words find more.',
  searchFound: 'What was found',
  searchIn: 'In',

  downloadFile: 'Download',
  versionsTitle: 'Versions',
  versionsHint: 'Every write to this file is kept. The one at the top is its content now.',
  versionsHintEditor:
    'Every write to this file is kept. The one at the top is its content now; restoring another puts a copy of it on top.',
  versionWritten: 'Written',
  versionBy: 'By',
  current: 'Current',
  downloadVersion: (when: string) => `Download the version of ${when}`,
  restoreVersion: (when: string) => `Restore the version of ${when}`,
  versionRestored: (when: string) => `Restored the version of ${when}`,
  versionConflict: 'The file was written to in the meantime. Look at its versions again, then restore.',
  versionGone: 'That version, or the file, is no longer here.',
  versionSpaceNoRoom:
    'The space has no room for this: restoring keeps the old version and adds one as large. The owner of the space can make room or raise its limit.',
  versionMemberNoRoom:
    'This would take you past your storage limit in this space: restoring keeps the old version and adds one as large. The owner of the space can raise your limit.',

  folderTitle: 'New folder',
  nameLabel: 'Name',
  folderPlaceholder: 'Untitled folder',
  folderCreate: 'Create',
  cancel: 'Cancel',
  nameMissing: 'Give it a name.',
  nameInvalid: 'A name cannot contain /, and cannot be . or ..',
  nameTaken: 'That name is already used in this folder.',
  parentGone: 'The folder this was going into is no longer here.',

  goneTitle: 'Nothing here',
  goneDescription: 'There is no file or folder at this address. It may have been moved to the trash.',
  toFiles: 'Go to the files of this space'
};
