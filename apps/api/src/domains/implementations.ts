import type { Db } from '@pocketmice/db';
import type { FileStorage } from '../external/storage/fileStorage.ts';
import type { Implementation } from '../http/operation.ts';
import { createApiKey } from './apiKey/createApiKey.ts';
import { deleteApiKey } from './apiKey/deleteApiKey.ts';
import { getApiKeys } from './apiKey/getApiKeys.ts';
import type { SignIn } from './auth/auth.ts';
import { requestSignInCode } from './auth/requestSignInCode.ts';
import { addConversationMember } from './conversation/addConversationMember.ts';
import { createConversation } from './conversation/createConversation.ts';
import { createMessage } from './conversation/createMessage.ts';
import { deleteConversation } from './conversation/deleteConversation.ts';
import { deleteMessage } from './conversation/deleteMessage.ts';
import { getAllConversations } from './conversation/getAllConversations.ts';
import { getConversation } from './conversation/getConversation.ts';
import { getConversations } from './conversation/getConversations.ts';
import { getMessages } from './conversation/getMessages.ts';
import { leaveConversation } from './conversation/leaveConversation.ts';
import { markConversationRead } from './conversation/markConversationRead.ts';
import { removeConversationMember } from './conversation/removeConversationMember.ts';
import { updateConversation } from './conversation/updateConversation.ts';
import { createFolder } from './file/createFolder.ts';
import { deleteFile } from './file/deleteFile.ts';
import { emptyTrash } from './file/emptyTrash.ts';
import { getFile } from './file/getFile.ts';
import { getFileByPath } from './file/getFileByPath.ts';
import { getFileDownloadUrl } from './file/getFileDownloadUrl.ts';
import { getFileSize } from './file/getFileSize.ts';
import { getFiles } from './file/getFiles.ts';
import { getFileVersions } from './file/getFileVersions.ts';
import { getMatchingFiles } from './file/getMatchingFiles.ts';
import { getTrashedFiles } from './file/getTrashedFiles.ts';
import { moveFile } from './file/moveFile.ts';
import { restoreFile } from './file/restoreFile.ts';
import { restoreFileVersion } from './file/restoreFileVersion.ts';
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
import { deleteSpace } from './space/deleteSpace.ts';
import { getMembers } from './space/getMembers.ts';
import { getSpaceSize } from './space/getSpaceSize.ts';
import { getSpaces } from './space/getSpaces.ts';
import { leaveSpace } from './space/leaveSpace.ts';
import { removeMember } from './space/removeMember.ts';
import { updateMember } from './space/updateMember.ts';
import { updateMemberStorageLimit } from './space/updateMemberStorageLimit.ts';
import { updateSpace } from './space/updateSpace.ts';
import { updateSpaceStorageLimit } from './space/updateSpaceStorageLimit.ts';

/** What the implementations need from outside. main.ts passes it in; a test passes its own */
export interface DomainDeps {
  db: Db;
  /** Where the bytes of files are kept */
  storage: FileStorage;
  /** The version of this server */
  version: string;
  /** How people sign in to this server (see createAuth in domains/auth/auth.ts) */
  signIn: SignIn;
  /**
   * Called when something failed that the caller is not told about: what they asked for is done, and the server is
   * left with something to clean up. where says in which part of the code.
   */
  reportError: (error: unknown, where: string) => void;
}

/**
 * Every operation the api implements. An operation defined in the contract has to be listed here to exist:
 * implementations.test.ts fails for one that is missing.
 */
export function domainImplementations(deps: DomainDeps): Implementation[] {
  return [
    getServerInfo(deps),
    requestSignInCode(deps),
    getProfile(deps),
    updateProfile(deps),
    getSpaces(deps),
    createSpace(deps),
    updateSpace(deps),
    getSpaceSize(deps),
    updateSpaceStorageLimit(deps),
    getMembers(deps),
    updateMember(deps),
    updateMemberStorageLimit(deps),
    removeMember(deps),
    leaveSpace(deps),
    deleteSpace(deps),
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
    getFileSize(deps),
    getFileDownloadUrl(deps),
    getMatchingFiles(deps),
    createFolder(deps),
    updateFile(deps),
    moveFile(deps),
    trashFile(deps),
    restoreFile(deps),
    getTrashedFiles(deps),
    getFileVersions(deps),
    restoreFileVersion(deps),
    deleteFile(deps),
    emptyTrash(deps),
    createConversation(deps),
    getConversations(deps),
    getAllConversations(deps),
    getConversation(deps),
    updateConversation(deps),
    addConversationMember(deps),
    leaveConversation(deps),
    removeConversationMember(deps),
    deleteConversation(deps),
    getMessages(deps),
    createMessage(deps),
    deleteMessage(deps),
    markConversationRead(deps)
  ];
}
