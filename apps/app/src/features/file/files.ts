import {
  createFolder,
  fileDescription,
  fileName,
  type getFile,
  getFiles,
  moveFile,
  updateFile
} from '@pocketmice/contract/domains/file';
import type { OutputOf } from '@pocketmice/contract/operation';
import { PAGE_SIZE_MAX } from '@pocketmice/contract/paging';
import { queryOptions } from '@tanstack/react-query';
import { ApiFailure, call, failureText, spaceChanged } from '@/lib/api';
import { language } from '@/lib/language/language';
import { languageTag } from '@/lib/language/languages';
import { inOrder } from './fileOrder';
import { fileText } from './text';

// What is in a space: a tree of files and folders. A page shows one folder of it, and which one is in its address:
// /spaces/<space> is what is directly in the space, /spaces/<space>/files/<folder> is a folder.
// What changes the tree is here too: a new folder, another name, another description, another place. Each answers
// null when it is done, or the sentence that says why it is not; and whatever the api said, what was read from
// the space is asked for again: a refusal often means the page was showing what is no longer so (a name an agent
// took a moment ago, a folder that is gone).

/** A file or a folder, as the api answers one */
export type DriveFile = OutputOf<typeof getFile>['file'];

/**
 * Everything that is directly in a folder (parentId null: directly in the space), in the order the page shows it.
 * The api gives a folder a page at a time, in the order of the names. All the pages are read here, so that the
 * page can put the folders first and say how many of each there are. A folder with tens of thousands of entries
 * takes long to open that way; that is known and left as it is.
 * It is kept under the name of the operation and the place, as a single call would be: marking what was read from
 * a space as stale (spaceChanged) reaches it too.
 */
export function folderQuery(spaceId: string, parentId: string | null) {
  return queryOptions<DriveFile[], ApiFailure<'NOT_FOUND'>>({
    queryKey: [getFiles.name, { spaceId, parentId }, 'whole'],
    queryFn: async () => {
      const files: DriveFile[] = [];
      let cursor: string | undefined;
      do {
        const page = await call(getFiles, { spaceId, parentId, limit: PAGE_SIZE_MAX, cursor });
        if (!page.ok) throw new ApiFailure<'NOT_FOUND'>(page.code, page.message);
        files.push(...page.data.files);
        cursor = page.data.nextCursor ?? undefined;
      } while (cursor !== undefined);
      return inOrder(files, namesCompare);
    }
  });
}

/** Names as a person of this language expects them in a list: file2 before file10, and a before B */
const namesCompare = new Intl.Collator(languageTag(language), { numeric: true }).compare;

/** What is wrong with a name someone typed, when the api would not take it */
function nameProblem(typed: string): string {
  return typed.trim() === '' ? fileText.nameMissing : fileText.nameInvalid;
}

/** Makes a folder called name in a folder (parentId null: directly in the space) */
export async function makeFolder(spaceId: string, parentId: string | null, name: string): Promise<string | null> {
  const checked = fileName.safeParse(name);
  if (!checked.success) return nameProblem(name);

  const result = await call(createFolder, { spaceId, parentId, name: checked.data });
  spaceChanged(spaceId);
  return result.ok ? null : failureText(result.code, { CONFLICT: fileText.nameTaken, NOT_FOUND: fileText.parentGone });
}

/** Gives a file or a folder another name. A name that is the one it has changes nothing, and is done */
export async function renameFile(spaceId: string, file: DriveFile, name: string): Promise<string | null> {
  const checked = fileName.safeParse(name);
  if (!checked.success) return nameProblem(name);
  if (checked.data === file.name) return null;
  return update(spaceId, file, { name: checked.data });
}

/** Describes a file or a folder: description is all of what it says from now on, and empty takes it away */
export async function describeFile(spaceId: string, file: DriveFile, description: string): Promise<string | null> {
  const checked = fileDescription.safeParse(description);
  if (!checked.success) return failureText('INVALID_INPUT', {});
  if (checked.data === file.description) return null;
  return update(spaceId, file, { description: checked.data });
}

/** Changes what a file or a folder is called or how it is described: the two are one operation of the api */
async function update(
  spaceId: string,
  file: DriveFile,
  change: { name: string } | { description: string }
): Promise<string | null> {
  const result = await call(updateFile, { spaceId, fileId: file.id, ...change });
  spaceChanged(spaceId);
  // CONFLICT is about a name: it has its sentence also where only the description is changed
  return result.ok ? null : failureText(result.code, { CONFLICT: fileText.nameTaken, NOT_FOUND: fileText.itemGone });
}

/** Moves a file or a folder into a folder (parentId null: directly into the space), with everything in it */
export async function moveFileTo(spaceId: string, file: DriveFile, parentId: string | null): Promise<string | null> {
  const result = await call(moveFile, { spaceId, fileId: file.id, parentId });
  spaceChanged(spaceId);
  return result.ok ? null : failureText(result.code, { CONFLICT: fileText.moveConflict, NOT_FOUND: fileText.moveGone });
}
