import { type getFile, namesOfPath, pathOfNames } from '@pocketmice/contract/domains/file';
import type { OutputOf } from '@pocketmice/contract/operation';

// What a list of files works out from what the api answered, with nothing of the browser in it.

type DriveFile = OutputOf<typeof getFile>['file'];

/**
 * The order a folder is shown in: the folders first, then the files, each by name. Two names the comparison takes
 * for equal (it may ignore what a person would) keep one order, by how they are written.
 */
export function inOrder(files: readonly DriveFile[], compare: (a: string, b: string) => number): DriveFile[] {
  return [...files].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  });
}

/**
 * The folders above a folder, from the top of the space down: each with its name and its path. They are read from
 * the path of the folder, which every answer carries; the api does not say what their ids are.
 */
export function foldersAbove(path: string): { name: string; path: string }[] {
  const names = namesOfPath(path) ?? [];
  return names.slice(0, -1).map((name, index) => ({ name, path: pathOfNames(names.slice(0, index + 1)) }));
}

/**
 * The folders above something that have to be asked for by their paths before the page knows which they are: all
 * of them but the one right above it, which the file itself names (parentId).
 */
export function foldersToFind(path: string): { name: string; path: string }[] {
  return foldersAbove(path).slice(0, -1);
}

/**
 * The folder something is in, by the names from the top of the space down to it: Reports / 2026. Null when it is
 * directly in the space.
 */
export function placeOf(path: string): string | null {
  const above = (namesOfPath(path) ?? []).slice(0, -1);
  return above.length > 0 ? above.join(' / ') : null;
}
