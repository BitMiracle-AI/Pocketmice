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

  folderTitle: 'New folder',
  nameLabel: 'Name',
  folderPlaceholder: 'Untitled folder',
  folderCreate: 'Create',
  cancel: 'Cancel',
  nameMissing: 'Give it a name.',
  nameInvalid: 'A name cannot contain /, and cannot be . or ..',
  nameTaken: 'That name is already used in this folder.',
  parentGone: 'The folder this was going into is no longer here.',

  goneTitle: 'No such folder',
  goneDescription: 'There is no folder at this address. It may have been moved to the trash.',
  toFiles: 'Go to the files of this space'
};
