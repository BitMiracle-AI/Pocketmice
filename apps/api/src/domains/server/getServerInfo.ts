import { getServerInfo as definition } from '@pocketmice/contract/domains/server';
import { implement } from '../../http/operation.ts';
import type { SignIn } from '../auth/auth.ts';

export function getServerInfo({ version, signIn }: { version: string; signIn: SignIn }) {
  return implement(definition, async () => ({ version, signInMethod: signIn.method }));
}
