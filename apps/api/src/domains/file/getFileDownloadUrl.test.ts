import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { createApiKey } from '@pocketmice/contract/domains/apiKey';
import {
  createFolder,
  FILE_CONTENT_PATH,
  getFileDownloadUrl,
  trashFile,
  updateFile
} from '@pocketmice/contract/domains/file';
import { createSpace } from '@pocketmice/contract/domains/space';
import { spaceMembers } from '@pocketmice/db/schema/space';
import type { CurrentUser } from '../../http/operation.ts';
import { NOBODY, useTestApi } from '../testing.ts';

const api = useTestApi();

interface Uploaded {
  id: string;
  version: { id: string; size: number; sha256: string };
}

async function makeSpace(owner: CurrentUser) {
  const result = await api.as(owner)(createSpace, { name: 'Research notes' });
  assert.ok(result.ok, `createSpace should have worked: ${JSON.stringify(result)}`);
  return result.data.space.id;
}

/** Uploads content as this person, as a new file or over one, and returns the file */
async function upload(person: CurrentUser, query: Record<string, string>, content: Buffer | string) {
  const body = Buffer.from(content);
  const response = await api.send(person, `${FILE_CONTENT_PATH}?${new URLSearchParams(query)}`, {
    method: 'PUT',
    headers: { 'content-length': String(body.length) },
    body
  });
  const answer = (await response.json()) as { file: Uploaded };
  assert.equal(response.status, 200, `the upload should have worked: ${JSON.stringify(answer)}`);
  return answer.file;
}

test('getFileDownloadUrl answers with an address the content is fetched from, and with the version it is', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const bytes = randomBytes(10_000);
  const file = await upload(ada, { spaceId, name: 'data.bin' }, bytes);

  const result = await api.as(ada)(getFileDownloadUrl, { spaceId, fileId: file.id, versionId: null });

  assert.ok(result.ok);
  const { url, version } = result.data;
  assert.equal(version.id, file.version.id);
  assert.deepEqual([version.size, version.sha256], [bytes.length, file.version.sha256]);
  assert.equal(version.user.id, ada.id);
  // The address is the storage's, and holding it is enough: nothing says who is fetching
  assert.equal(new URL(url).pathname.endsWith(`/${version.id}`), true);
  const fetched = await fetch(url);
  assert.equal(fetched.status, 200);
  assert.deepEqual(Buffer.from(await fetched.arrayBuffer()), bytes);
  assert.equal(fetched.headers.get('content-disposition'), "attachment; filename*=UTF-8''data.bin");
  assert.equal(fetched.headers.get('content-type'), 'application/octet-stream');
  // A part of it
  const part = await fetch(url, { headers: { range: 'bytes=0-9' } });
  assert.deepEqual([part.status, Buffer.from(await part.arrayBuffer())], [206, bytes.subarray(0, 10)]);
});

test('getFileDownloadUrl gives an earlier version when asked for it by id, saved under the name the file has now', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const first = await upload(ada, { spaceId, name: 'notes.md' }, 'the first');
  const second = await upload(
    ada,
    { spaceId, fileId: first.id, baseVersionId: first.version.id },
    'the second, longer'
  );
  const renamed = await api.as(ada)(updateFile, { spaceId, fileId: first.id, name: 'renamed notes.md' });
  assert.ok(renamed.ok);

  const now = await api.as(ada)(getFileDownloadUrl, { spaceId, fileId: first.id, versionId: null });
  const earlier = await api.as(ada)(getFileDownloadUrl, { spaceId, fileId: first.id, versionId: first.version.id });
  const named = await api.as(ada)(getFileDownloadUrl, { spaceId, fileId: first.id, versionId: second.version.id });

  assert.ok(now.ok && earlier.ok && named.ok);
  assert.deepEqual([now.data.version.id, named.data.version.id], [second.version.id, second.version.id]);
  assert.equal(await (await fetch(now.data.url)).text(), 'the second, longer');
  assert.equal(earlier.data.version.id, first.version.id);
  const old = await fetch(earlier.data.url);
  assert.equal(await old.text(), 'the first');
  assert.equal(old.headers.get('content-disposition'), "attachment; filename*=UTF-8''renamed%20notes.md");
});

test('getFileDownloadUrl is NOT_FOUND for what has no content to give: no such file, a folder, a file in the trash, a version of another file', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const file = await upload(ada, { spaceId, name: 'notes.md' }, 'kept');
  const other = await upload(ada, { spaceId, name: 'other.md' }, 'another');
  const folder = await api.as(ada)(createFolder, { spaceId, parentId: null, name: 'Reports' });
  assert.ok(folder.ok);
  const trashed = await upload(ada, { spaceId, name: 'gone.md' }, 'in the trash');
  assert.ok((await api.as(ada)(trashFile, { spaceId, fileId: trashed.id })).ok);

  for (const input of [
    { fileId: NOBODY, versionId: null },
    { fileId: folder.data.file.id, versionId: null },
    { fileId: trashed.id, versionId: null },
    { fileId: trashed.id, versionId: trashed.version.id },
    { fileId: file.id, versionId: other.version.id },
    { fileId: file.id, versionId: NOBODY }
  ]) {
    const result = await api.as(ada)(getFileDownloadUrl, { spaceId, ...input });
    assert.equal(!result.ok && result.code, 'NOT_FOUND', JSON.stringify(input));
  }
});

test('getFileDownloadUrl is a read of the space: a viewer and a read-only key get an address, someone outside and nobody do not', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const stranger = await api.addPerson('Edsger');
  const spaceId = await makeSpace(ada);
  await api.db.insert(spaceMembers).values({ spaceId, userId: grace.id, role: 'viewer' });
  const file = await upload(ada, { spaceId, name: 'notes.md' }, 'for members');
  const key = await api.as(ada)(createApiKey, { name: 'Reader', permission: 'read' });
  assert.ok(key.ok);
  const input = { spaceId, fileId: file.id, versionId: null };

  for (const call of [api.as(grace), api.withKey(key.data.apiKey.key)]) {
    const result = await call(getFileDownloadUrl, input);
    assert.ok(result.ok);
    assert.equal(await (await fetch(result.data.url)).text(), 'for members');
  }
  const outside = await api.as(stranger)(getFileDownloadUrl, input);
  assert.equal(!outside.ok && outside.code, 'UNKNOWN_SPACE');
  const nobody = await api.as(null)(getFileDownloadUrl, input);
  assert.equal(!nobody.ok && nobody.code, 'UNAUTHENTICATED');
});
