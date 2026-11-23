import type { Db } from '@pocketmice/db';
import type { Implementation } from '../http/operation.ts';
import { createApiKey } from './apiKey/createApiKey.ts';
import { deleteApiKey } from './apiKey/deleteApiKey.ts';
import { getApiKeys } from './apiKey/getApiKeys.ts';
import { createFolder } from './file/createFolder.ts';
import { getFile } from './file/getFile.ts';
import { getFileByPath } from './file/getFileByPath.ts';
import { getFiles } from './file/getFiles.ts';
import { getTrashedFiles } from './file/getTrashedFiles.ts';
import { moveFile } from './file/moveFile.ts';
import { restoreFile } from './file/restoreFile.ts';
import { trashFile } from './file/trashFile.ts';
import { updateFile } from './file/updateFile.ts';
import { createInvite } from './invite/createInvite.ts';
import { deleteInvite } from './invite/deleteInvite.ts';
import { getInvites } from './invite/getInvites.ts';
import { joinSpace } from './invite/joinSpace.ts';
import { getProfile } from './profile/getProfile.ts';
import { updateProfile } from './profile/updateProfile.ts';
import { getServerInfo } from './server/getServerInfo.ts';
import { createSpace } from './space/createSpace.ts';
import { getMembers } from './space/getMembers.ts';
import { getSpaces } from './space/getSpaces.ts';
import { leaveSpace } from './space/leaveSpace.ts';
import { removeMember } from './space/removeMember.ts';
import { updateMember } from './space/updateMember.ts';

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
  return [
    getServerInfo(deps),
    getProfile(deps),
    updateProfile(deps),
    getSpaces(deps),
    createSpace(deps),
    getMembers(deps),
    updateMember(deps),
    removeMember(deps),
    leaveSpace(deps),
    createInvite(deps),
    getInvites(deps),
    deleteInvite(deps),
    joinSpace(deps),
    getApiKeys(deps),
    createApiKey(deps),
    deleteApiKey(deps),
    getFiles(deps),
    getFile(deps),
    getFileByPath(deps),
    createFolder(deps),
    updateFile(deps),
    moveFile(deps),
    trashFile(deps),
    restoreFile(deps),
    getTrashedFiles(deps)
  ];
}
