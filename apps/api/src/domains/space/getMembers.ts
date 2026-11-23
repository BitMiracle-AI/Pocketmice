import { getMembers as definition } from '@pocketmice/contract/domains/space';
import type { Db } from '@pocketmice/db';
import { implement } from '../../http/operation.ts';
import { findMembers } from './findMembers.ts';

export function getMembers({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => ({ members: await findMembers(db, input.spaceId) }));
}
