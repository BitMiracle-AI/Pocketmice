import { getSpaceSize as definition } from '@pocketmice/contract/domains/space';
import type { Db } from '@pocketmice/db';
import { implement } from '../../http/operation.ts';
import { spaceSizeOf } from './storageLimit.ts';

export function getSpaceSize({ db }: { db: Db }) {
  return implement(definition, ({ input }) => spaceSizeOf(db, input.spaceId));
}
