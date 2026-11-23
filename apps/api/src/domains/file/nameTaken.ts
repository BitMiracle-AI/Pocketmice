import { ApiError } from '../../http/operation.ts';

/** The indexes that keep a name used once in one place (see the files table) */
const NAME_INDEXES = ['files_top_name_idx', 'files_folder_name_idx'];

/** The error code of the database for "this would be a second row where an index allows one" */
const UNIQUE_VIOLATION = '23505';

/** How many errors deep, one wrapping another as its cause, the database's own error is looked for */
const MAX_CAUSES = 5;

/** Whether this error is the database refusing a name because it is taken in that place */
function isNameTaken(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < MAX_CAUSES && current instanceof Error; depth += 1) {
    const { code, constraint_name: index } = current as { code?: unknown; constraint_name?: unknown };
    if (code === UNIQUE_VIOLATION && typeof index === 'string' && NAME_INDEXES.includes(index)) return true;
    current = current.cause;
  }
  return false;
}

/**
 * Runs a change that gives a file a name in a place: making it, renaming it, moving it, restoring it.
 * CONFLICT when the name is taken there. Whether it is taken is not asked beforehand: the database decides when
 * the row is written, so of two people taking the same name at the same moment exactly one gets it.
 */
export async function unlessNameTaken<Result>(name: string, change: () => Promise<Result>): Promise<Result> {
  try {
    return await change();
  } catch (error) {
    if (!isNameTaken(error)) throw error;
    throw new ApiError('CONFLICT', `The name "${name}" is taken in that folder.`);
  }
}
