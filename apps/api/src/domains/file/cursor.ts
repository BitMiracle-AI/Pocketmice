import { ApiError } from '../../http/operation.ts';

// The cursor of a list that goes by time: where a page ended, as the time of its last entry and that entry's id,
// written as the two with a _ between. The time alone would not do: two entries of the same millisecond would share
// it, and the page after would skip one or repeat one.
// The time is written to the millisecond, so the columns such a list goes by are kept to the millisecond too (see
// the files table): a finer time would not come back from the cursor as it was.

const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/;

/** Where a page ended */
export interface TimeCursor {
  /** An ISO 8601 time in UTC */
  time: string;
  id: string;
}

/** The cursor for a page that ended on the entry of this time and this id */
export function writeTimeCursor(time: Date, id: string): string {
  return `${time.toISOString()}_${id}`;
}

/**
 * Reads the cursor a caller passed back. Null for no cursor: the first page.
 * INVALID_INPUT when it is not a cursor this server gave out.
 */
export function readTimeCursor(cursor: string | undefined): TimeCursor | null {
  if (cursor === undefined) return null;
  const [, time, id] = CURSOR.exec(cursor) ?? [];
  // Shaped like a time is not yet a time: the 45th of the 13th month is not one. Only what writeTimeCursor writes
  // is read back
  const moment = new Date(time ?? '');
  if (
    time === undefined ||
    id === undefined ||
    Number.isNaN(moment.getTime()) ||
    writeTimeCursor(moment, id) !== cursor
  ) {
    throw new ApiError('INVALID_INPUT', 'cursor: Pass the nextCursor of the page before, as it was.');
  }
  return { time, id };
}
