import type { Implementation } from '../http/operation.ts';
import { getServerInfo } from './server/getServerInfo.ts';

/** What the implementations need from outside. main.ts passes it in; a test passes its own */
export interface DomainDeps {
  /** The version of this server */
  version: string;
}

/**
 * Every operation the api implements. An operation defined in the contract has to be listed here to exist:
 * implementations.test.ts fails for one that is missing.
 */
export function domainImplementations(deps: DomainDeps): Implementation[] {
  return [getServerInfo(deps)];
}
