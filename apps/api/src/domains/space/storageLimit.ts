import type { Db } from '@pocketmice/db';
import { fileVersions } from '@pocketmice/db/schema/file';
import { spaceMembers, spaces } from '@pocketmice/db/schema/space';
import { and, eq, sql } from 'drizzle-orm';
import { ApiError } from '../../http/operation.ts';

// Storage limits: how much a space holds, how much each member holds in it, and the check that a write passes
// before its bytes are taken. The rules are in the contract ("Storage limits" in domains/space.ts).
// What is held is written nowhere: it is the sizes of the versions, added up when it is asked for. A number kept
// beside them would say the same thing a second time, and every write and every delete would have to keep it
// right. The versions name their space and are indexed for this question (see fileVersions), so adding up reads
// one index and takes as long as the space is large. Measured in a database of three million versions, what an
// upload waits for the check: about 2 ms in a space of a few thousand versions, 3 ms in one of fifty thousand, 46 ms
// in one of a million; and half a millisecond where no limit is set, since then nothing is added up.

/** The bytes of all these versions together. No versions is no bytes */
const bytesHeld = sql<number>`coalesce(sum(${fileVersions.size}), 0)`.mapWith(Number);

/** How much a space holds, and the most it may: what getSpaceSize answers with */
export async function spaceSizeOf(
  db: Db,
  spaceId: string
): Promise<{ storageSize: number; storageLimit: number | null }> {
  const [space] = await db.select({ storageLimit: spaces.storageLimit }).from(spaces).where(eq(spaces.id, spaceId));
  // Whoever asks is a member of it, so the space is there
  if (!space) throw new Error(`Space ${spaceId} has a member and was not found.`);
  const [held] = await db.select({ bytes: bytesHeld }).from(fileVersions).where(eq(fileVersions.spaceId, spaceId));
  return { storageSize: held?.bytes ?? 0, storageLimit: space.storageLimit };
}

/**
 * How much each person holds in a space: the versions they wrote. Someone who wrote none is not in it, and someone
 * who wrote some and is no longer a member is.
 */
export async function memberSizesOf(db: Db, spaceId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ userId: fileVersions.userId, bytes: bytesHeld })
    .from(fileVersions)
    .where(eq(fileVersions.spaceId, spaceId))
    .groupBy(fileVersions.userId);
  return new Map(rows.map((row) => [row.userId, row.bytes]));
}

/**
 * Whether this person may add this many bytes to the space now.
 * SPACE_STORAGE_LIMIT_EXCEEDED: the space would hold more than its limit. MEMBER_STORAGE_LIMIT_EXCEEDED: the space
 * would not, and the person would hold more than theirs. When both would be passed it is the space's that is
 * told: raising the member's would not help.
 * Asked before the bytes are taken, and not again when the rows are written: writes that are under way at the same
 * time each see what was kept when they began, and together can go past a limit by as much as they add (see the
 * contract).
 */
export async function assertStorageRoom(db: Db, spaceId: string, userId: string, bytes: number): Promise<void> {
  // Content of no bytes adds nothing to what is held: an empty file is made in a space that is full
  if (bytes === 0) return;

  const [limits] = await db
    .select({ space: spaces.storageLimit, member: spaceMembers.storageLimit })
    .from(spaces)
    .leftJoin(spaceMembers, and(eq(spaceMembers.spaceId, spaces.id), eq(spaceMembers.userId, userId)))
    .where(eq(spaces.id, spaceId));
  const spaceLimit = limits?.space ?? null;
  const memberLimit = limits?.member ?? null;
  // No limit, nothing to add up: a space whose owner has set none pays nothing for this
  if (spaceLimit === null && memberLimit === null) return;

  const [held] = await db
    .select({
      space: bytesHeld,
      member:
        sql<number>`coalesce(sum(${fileVersions.size}) filter (where ${fileVersions.userId} = ${userId}), 0)`.mapWith(
          Number
        )
    })
    .from(fileVersions)
    .where(eq(fileVersions.spaceId, spaceId));
  const inSpace = held?.space ?? 0;
  const byMember = held?.member ?? 0;

  if (spaceLimit !== null && inSpace + bytes > spaceLimit) {
    throw new ApiError(
      'SPACE_STORAGE_LIMIT_EXCEEDED',
      `Space ${spaceId} holds ${inSpace} bytes and may hold ${spaceLimit}: ${bytes} more do not fit. Its owner can delete files for good, or raise the limit.`
    );
  }
  if (memberLimit !== null && byMember + bytes > memberLimit) {
    throw new ApiError(
      'MEMBER_STORAGE_LIMIT_EXCEEDED',
      `You hold ${byMember} bytes in space ${spaceId} and may hold ${memberLimit}: ${bytes} more do not fit. The owner of the space can raise your limit, or delete for good what you wrote.`
    );
  }
}
