import { getServerInfo as definition } from '@pocketmice/contract/domains/server';
import { implement } from '../../http/operation.ts';

export function getServerInfo({ version }: { version: string }) {
  return implement(definition, async () => ({ version }));
}
