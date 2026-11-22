import type { Db } from '@pocketmice/db';
import type { Implementation } from '../http/operation.ts';
import { getProfile } from './profile/getProfile.ts';
import { updateProfile } from './profile/updateProfile.ts';
import { getServerInfo } from './server/getServerInfo.ts';
import { createSpace } from './space/createSpace.ts';
import { getSpaces } from './space/getSpaces.ts';

/** What the implementations need from outside. main.ts passes it in; a test passes its own */
export interface DomainDeps {
  db: Db;
  /** The version of this server */
  version: string;
}

/**
 * Every operation the api implements. An operation defined in the contract has to be listed here to exist:
 * implementations.test.ts fails for one that is missing.
 */
export function domainImplementations(deps: DomainDeps): Implementation[] {
  return [getServerInfo(deps), getProfile(deps), updateProfile(deps), getSpaces(deps), createSpace(deps)];
}
