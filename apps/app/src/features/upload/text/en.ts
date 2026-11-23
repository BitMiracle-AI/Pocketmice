/** The sentences of the uploads, in English. This file says which sentences there are */
export const en = {
  uploading: (count: number) => (count === 1 ? 'Uploading 1 file' : `Uploading ${count} files`),
  needDecision: (count: number) => (count === 1 ? '1 file needs a decision' : `${count} files need a decision`),
  notUploaded: (count: number) => (count === 1 ? '1 file was not uploaded' : `${count} files were not uploaded`),
  uploaded: (count: number) => (count === 1 ? '1 file uploaded' : `${count} files uploaded`),
  close: 'Close',
  waiting: 'Waiting',
  cancel: (name: string) => `Cancel the upload of ${name}`,
  dismiss: (name: string) => `Remove ${name} from this list`,
  doneAsFile: 'Uploaded',
  doneAsVersion: 'Saved as a new version',
  taken: 'A file with this name is already here.',
  takenByFolder: 'A folder with this name is already here.',
  asVersion: 'Save as new version',
  keepBoth: 'Keep both',
  skip: 'Skip',
  tryAgain: 'Try again',
  tooLarge: (most: string) => `Larger than ${most}, the most a file can be.`,
  folderGone: 'The folder it was going into is no longer here.',
  changedMeanwhile: 'The file changed while this was going up. Try again.',
  spaceFull: 'The space is full. Its owner can make room or raise its limit.',
  memberFull: 'You have reached your storage limit in this space. Its owner can raise it.',
  /** What the browser asks before the page is closed while files are still going up */
  leaving: 'Files are still being uploaded.'
};
