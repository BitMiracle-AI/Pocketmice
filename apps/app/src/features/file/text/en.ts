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

  folderTitle: 'New folder',
  folderNameLabel: 'Name',
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
