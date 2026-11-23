import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiKey } from '@pocketmice/contract/domains/apiKey';
import {
  createFolder,
  FILE_DESCRIPTION_MAX_LENGTH,
  getFile,
  getFileByPath,
  getFiles,
  getTrashedFiles,
  moveFile,
  restoreFile,
  trashFile,
  updateFile
} from '@pocketmice/contract/domains/file';
import { createSpace } from '@pocketmice/contract/domains/space';
import { files } from '@pocketmice/db/schema/file';
import { spaceMembers } from '@pocketmice/db/schema/space';
import { eq } from 'drizzle-orm';
import type { CurrentUser } from '../../http/operation.ts';
import { NOBODY, useTestApi } from '../testing.ts';

const api = useTestApi();

/** Makes a space as this person and returns its id */
async function makeSpace(owner: CurrentUser, name = 'Research notes') {
  const result = await api.as(owner)(createSpace, { name });
  assert.ok(result.ok, `createSpace should have worked: ${JSON.stringify(result)}`);
  return result.data.space.id;
}

/** Makes a folder as this person, in the folder parentId or directly in the space, and returns it */
async function makeFolder(person: CurrentUser, spaceId: string, parentId: string | null, name: string) {
  const result = await api.as(person)(createFolder, { spaceId, parentId, name });
  assert.ok(result.ok, `createFolder "${name}" should have worked: ${JSON.stringify(result)}`);
  return result.data.file;
}

/** The names of what is in a place, as this person sees them */
async function namesIn(person: CurrentUser, spaceId: string, parentId: string | null) {
  const result = await api.as(person)(getFiles, { spaceId, parentId });
  assert.ok(result.ok, `getFiles should have worked: ${JSON.stringify(result)}`);
  return result.data.files.map((file) => file.name);
}

/** The path of a file as this person sees it now, or the error code */
async function pathOf(person: CurrentUser, spaceId: string, fileId: string) {
  const result = await api.as(person)(getFile, { spaceId, fileId });
  return result.ok ? result.data.file.path : result.code;
}

test('createFolder makes a folder directly in the space or in a folder, and answers with where it is', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const before = Date.now();

  const top = await api.as(ada)(createFolder, { spaceId, parentId: null, name: '  Reports ' });
  assert.ok(top.ok);
  const inside = await api.as(ada)(createFolder, {
    spaceId,
    parentId: top.data.file.id,
    name: '2026',
    description: '  One folder for each quarter. '
  });
  assert.ok(inside.ok);

  assert.deepEqual(
    { ...top.data.file, createdAt: '', updatedAt: '' },
    {
      id: top.data.file.id,
      parentId: null,
      name: 'Reports',
      kind: 'folder',
      description: '',
      path: '/Reports',
      // A folder has no content
      version: null,
      createdAt: '',
      updatedAt: ''
    }
  );
  assert.ok(Math.abs(Date.parse(top.data.file.createdAt) - before) < 60_000);
  assert.equal(inside.data.file.parentId, top.data.file.id);
  assert.equal(inside.data.file.path, '/Reports/2026');
  assert.equal(inside.data.file.description, 'One folder for each quarter.');
  // The row records who made it
  const [row] = await api.db.select().from(files).where(eq(files.id, inside.data.file.id));
  assert.equal(row?.userId, ada.id);
  assert.equal(row?.spaceId, spaceId);
});

test('createFolder refuses a name no file can have and a description that is too long, and makes nothing', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);

  for (const input of [
    { name: '' },
    { name: '   ' },
    { name: 'a/b' },
    { name: '..' },
    { name: 'a'.repeat(256) },
    { name: 'Reports', description: 'a'.repeat(FILE_DESCRIPTION_MAX_LENGTH + 1) },
    // Where it goes has to be said: leaving parentId out is not "directly in the space"
    { name: 'Reports', parentId: undefined }
  ]) {
    const result = await api.as(ada)(createFolder, { spaceId, parentId: null, ...input } as never);
    assert.equal(!result.ok && result.code, 'INVALID_INPUT', JSON.stringify(input).slice(0, 40));
  }

  assert.deepEqual(await namesIn(ada, spaceId, null), []);
});

test('in one place a name is used once; in another place, or written in another case, it is another name', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const otherSpaceId = await makeSpace(ada, 'Reports');
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  await makeFolder(ada, spaceId, reports.id, 'Reports');

  const again = await api.as(ada)(createFolder, { spaceId, parentId: null, name: 'Reports' });
  const insideAgain = await api.as(ada)(createFolder, { spaceId, parentId: reports.id, name: ' Reports ' });

  assert.equal(!again.ok && again.code, 'CONFLICT');
  assert.equal(!insideAgain.ok && insideAgain.code, 'CONFLICT');
  await makeFolder(ada, spaceId, null, 'reports');
  await makeFolder(ada, otherSpaceId, null, 'Reports');
  assert.deepEqual((await namesIn(ada, spaceId, null)).sort(), ['Reports', 'reports']);
  assert.deepEqual(await namesIn(ada, spaceId, reports.id), ['Reports']);
});

test('createFolder into a folder that is not there is NOT_FOUND: no such id, or a folder of another space', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const otherSpaceId = await makeSpace(ada, 'Reports');
  const elsewhere = await makeFolder(ada, otherSpaceId, null, 'Elsewhere');

  for (const parentId of [NOBODY, elsewhere.id]) {
    const result = await api.as(ada)(createFolder, { spaceId, parentId, name: 'Reports' });
    assert.equal(!result.ok && result.code, 'NOT_FOUND', parentId);
  }

  assert.deepEqual(await namesIn(ada, spaceId, null), []);
  assert.deepEqual(await namesIn(ada, otherSpaceId, elsewhere.id), []);
});

test('the database refuses a row whose folder is in another space', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const otherSpaceId = await makeSpace(ada, 'Reports');
  const elsewhere = await makeFolder(ada, otherSpaceId, null, 'Elsewhere');

  await assert.rejects(
    api.db.insert(files).values({ spaceId, parentId: elsewhere.id, name: 'Reports', kind: 'folder', userId: ada.id })
  );
});

test('getFiles lists what is in one place, in the order of the names: nothing deeper, nothing from elsewhere', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const otherSpaceId = await makeSpace(ada, 'Reports');
  const reports = await makeFolder(ada, spaceId, null, 'reports');
  await makeFolder(ada, spaceId, null, 'archive');
  await makeFolder(ada, spaceId, null, 'drafts');
  const year = await makeFolder(ada, spaceId, reports.id, '2026');
  await makeFolder(ada, spaceId, year.id, 'q1');
  await makeFolder(ada, otherSpaceId, null, 'elsewhere');

  const top = await api.as(ada)(getFiles, { spaceId, parentId: null });
  const inside = await api.as(ada)(getFiles, { spaceId, parentId: reports.id });

  assert.ok(top.ok && inside.ok);
  assert.deepEqual(
    top.data.files.map((file) => file.path),
    ['/archive', '/drafts', '/reports']
  );
  assert.equal(top.data.nextCursor, null);
  assert.deepEqual(inside.data, { files: [year], nextCursor: null });
  assert.deepEqual(await namesIn(ada, spaceId, year.id), ['q1']);
});

test('getFiles comes a page at a time: nextCursor leads to the page after, and the last page has none', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'reports');
  for (const name of ['e', 'b', 'd', 'a', 'c']) await makeFolder(ada, spaceId, reports.id, name);

  const pages: string[][] = [];
  let cursor: string | undefined;
  do {
    const page = await api.as(ada)(getFiles, { spaceId, parentId: reports.id, limit: 2, cursor });
    assert.ok(page.ok);
    pages.push(page.data.files.map((file) => file.path));
    cursor = page.data.nextCursor ?? undefined;
  } while (cursor !== undefined);

  assert.deepEqual(pages, [['/reports/a', '/reports/b'], ['/reports/c', '/reports/d'], ['/reports/e']]);
  // A page that holds exactly what is left is the last: no cursor that leads to an empty page
  const exact = await api.as(ada)(getFiles, { spaceId, parentId: reports.id, limit: 5 });
  assert.equal(exact.ok && exact.data.nextCursor, null);
  assert.equal(exact.ok && exact.data.files.length, 5);
});

test('getFiles of a folder that is not there is NOT_FOUND', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const otherSpaceId = await makeSpace(ada, 'Reports');
  const elsewhere = await makeFolder(ada, otherSpaceId, null, 'Elsewhere');

  for (const parentId of [NOBODY, elsewhere.id]) {
    const result = await api.as(ada)(getFiles, { spaceId, parentId });
    assert.equal(!result.ok && result.code, 'NOT_FOUND', parentId);
  }
});

test('getFile answers with the file; a file of another space, asked for in this one, is NOT_FOUND', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const otherSpaceId = await makeSpace(ada, 'Reports');
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const year = await makeFolder(ada, spaceId, reports.id, '2026');

  assert.deepEqual(await api.as(ada)(getFile, { spaceId, fileId: year.id }), { ok: true, data: { file: year } });
  for (const [inSpace, fileId] of [
    [spaceId, NOBODY],
    [otherSpaceId, year.id]
  ] as const) {
    const result = await api.as(ada)(getFile, { spaceId: inSpace, fileId });
    assert.equal(!result.ok && result.code, 'NOT_FOUND');
  }
});

test('getFileByPath finds the file a path leads to, and NOT_FOUND where it leads to nothing', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const otherSpaceId = await makeSpace(ada, 'Reports');
  // The same name at three depths: each path leads to its own
  const top = await makeFolder(ada, spaceId, null, 'notes');
  const middle = await makeFolder(ada, spaceId, top.id, 'notes');
  const bottom = await makeFolder(ada, spaceId, middle.id, 'notes');
  await makeFolder(ada, spaceId, null, 'Quarterly report');

  for (const expected of [top, middle, bottom]) {
    assert.deepEqual(await api.as(ada)(getFileByPath, { spaceId, path: expected.path }), {
      ok: true,
      data: { file: expected }
    });
  }
  const spaced = await api.as(ada)(getFileByPath, { spaceId, path: '/Quarterly report' });
  assert.equal(spaced.ok && spaced.data.file.name, 'Quarterly report');

  for (const [inSpace, path] of [
    [spaceId, '/nothing'],
    [spaceId, '/notes/nothing'],
    [spaceId, '/notes/notes/notes/notes'],
    [spaceId, '/Notes'],
    [otherSpaceId, '/notes']
  ] as const) {
    const result = await api.as(ada)(getFileByPath, { spaceId: inSpace, path });
    assert.equal(!result.ok && result.code, 'NOT_FOUND', path);
  }
  for (const path of ['', '/', 'notes', '/notes/', '/notes//notes']) {
    const result = await api.as(ada)(getFileByPath, { spaceId, path });
    assert.equal(!result.ok && result.code, 'INVALID_INPUT', `"${path}"`);
  }
});

test('updateFile changes the name, the description or both, leaves the rest, and what is inside follows', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const year = await makeFolder(ada, spaceId, reports.id, '2026');

  const described = await api.as(ada)(updateFile, {
    spaceId,
    fileId: reports.id,
    description: ' Final versions only. '
  });
  assert.ok(described.ok);
  assert.deepEqual(
    [described.data.file.name, described.data.file.description, described.data.file.path],
    ['Reports', 'Final versions only.', '/Reports']
  );

  const renamed = await api.as(ada)(updateFile, { spaceId, fileId: reports.id, name: ' Published ' });
  assert.ok(renamed.ok);
  assert.deepEqual(
    [renamed.data.file.name, renamed.data.file.description, renamed.data.file.path],
    ['Published', 'Final versions only.', '/Published']
  );
  assert.equal(renamed.data.file.id, reports.id);
  assert.equal(await pathOf(ada, spaceId, year.id), '/Published/2026');

  const both = await api.as(ada)(updateFile, { spaceId, fileId: year.id, name: '2027', description: '' });
  assert.ok(both.ok);
  assert.deepEqual(
    [both.data.file.name, both.data.file.description, both.data.file.path],
    ['2027', '', '/Published/2027']
  );
});

test('updateFile to a name taken in the same folder is CONFLICT; to its own name, or one taken elsewhere, it works', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const drafts = await makeFolder(ada, spaceId, null, 'Drafts');
  await makeFolder(ada, spaceId, reports.id, 'Drafts');

  const taken = await api.as(ada)(updateFile, { spaceId, fileId: drafts.id, name: 'Reports' });
  assert.equal(!taken.ok && taken.code, 'CONFLICT');
  assert.equal(await pathOf(ada, spaceId, drafts.id), '/Drafts');

  assert.equal((await api.as(ada)(updateFile, { spaceId, fileId: drafts.id, name: 'Drafts' })).ok, true);
  const elsewhere = await makeFolder(ada, spaceId, drafts.id, 'Old');
  assert.equal((await api.as(ada)(updateFile, { spaceId, fileId: elsewhere.id, name: 'Reports' })).ok, true);

  const missing = await api.as(ada)(updateFile, { spaceId, fileId: NOBODY, name: 'Anything' });
  assert.equal(!missing.ok && missing.code, 'NOT_FOUND');
});

test('moveFile moves a folder with everything in it, into a folder or to directly in the space', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const year = await makeFolder(ada, spaceId, reports.id, '2026');
  const quarter = await makeFolder(ada, spaceId, year.id, 'Q1');
  const archive = await makeFolder(ada, spaceId, null, 'Archive');

  const moved = await api.as(ada)(moveFile, { spaceId, fileId: year.id, parentId: archive.id });

  assert.ok(moved.ok);
  assert.deepEqual(
    [moved.data.file.id, moved.data.file.parentId, moved.data.file.name, moved.data.file.path],
    [year.id, archive.id, '2026', '/Archive/2026']
  );
  assert.equal(await pathOf(ada, spaceId, quarter.id), '/Archive/2026/Q1');
  assert.deepEqual(await namesIn(ada, spaceId, reports.id), []);
  assert.deepEqual(await namesIn(ada, spaceId, archive.id), ['2026']);

  const toTop = await api.as(ada)(moveFile, { spaceId, fileId: quarter.id, parentId: null });
  assert.equal(toTop.ok && toTop.data.file.path, '/Q1');
  assert.equal(toTop.ok && toTop.data.file.parentId, null);

  // Moving it to where it is changes nothing
  const stayed = await api.as(ada)(moveFile, { spaceId, fileId: quarter.id, parentId: null });
  assert.deepEqual(stayed, toTop);
});

test('moveFile refuses a folder into itself or into a folder inside it, a place where its name is taken, and no folder', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const otherSpaceId = await makeSpace(ada, 'Reports');
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const year = await makeFolder(ada, spaceId, reports.id, '2026');
  const quarter = await makeFolder(ada, spaceId, year.id, 'Q1');
  const archive = await makeFolder(ada, spaceId, null, 'Archive');
  await makeFolder(ada, spaceId, archive.id, '2026');
  const elsewhere = await makeFolder(ada, otherSpaceId, null, 'Elsewhere');

  for (const [fileId, parentId, code] of [
    [reports.id, reports.id, 'CONFLICT'],
    [reports.id, year.id, 'CONFLICT'],
    [reports.id, quarter.id, 'CONFLICT'],
    [year.id, archive.id, 'CONFLICT'],
    [year.id, NOBODY, 'NOT_FOUND'],
    [year.id, elsewhere.id, 'NOT_FOUND'],
    [NOBODY, archive.id, 'NOT_FOUND'],
    [elsewhere.id, archive.id, 'NOT_FOUND']
  ] as const) {
    const result = await api.as(ada)(moveFile, { spaceId, fileId, parentId });
    assert.equal(!result.ok && result.code, code, `${fileId} into ${parentId}`);
  }

  // Nothing moved
  assert.equal(await pathOf(ada, spaceId, reports.id), '/Reports');
  assert.equal(await pathOf(ada, spaceId, quarter.id), '/Reports/2026/Q1');
  assert.deepEqual(await namesIn(ada, spaceId, archive.id), ['2026']);
});

test('folders in a loop, which only writing to the database past the api can make, are not found, and asking ends', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const one = await makeFolder(ada, spaceId, null, 'One');
  const two = await makeFolder(ada, spaceId, one.id, 'Two');
  const kept = await makeFolder(ada, spaceId, null, 'Kept');
  await api.db.update(files).set({ parentId: two.id }).where(eq(files.id, one.id));

  for (const fileId of [one.id, two.id]) {
    assert.equal(await pathOf(ada, spaceId, fileId), 'NOT_FOUND');
    const into = await api.as(ada)(moveFile, { spaceId, fileId: kept.id, parentId: fileId });
    assert.equal(!into.ok && into.code, 'NOT_FOUND');
  }
  assert.deepEqual(await namesIn(ada, spaceId, null), ['Kept']);
});

test('a viewer reads and changes nothing; an editor changes', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const edsger = await api.addPerson('Edsger');
  const spaceId = await makeSpace(ada);
  await api.db.insert(spaceMembers).values([
    { spaceId, userId: grace.id, role: 'viewer' },
    { spaceId, userId: edsger.id, role: 'editor' }
  ]);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const trashed = await makeFolder(ada, spaceId, null, 'Old');
  await api.as(ada)(trashFile, { spaceId, fileId: trashed.id });

  const viewer = api.as(grace);
  const reads = [
    await viewer(getFiles, { spaceId, parentId: null }),
    await viewer(getFile, { spaceId, fileId: reports.id }),
    await viewer(getFileByPath, { spaceId, path: '/Reports' }),
    await viewer(getTrashedFiles, { spaceId })
  ];
  assert.deepEqual(
    reads.map((result) => result.ok),
    [true, true, true, true]
  );
  const writes = [
    await viewer(createFolder, { spaceId, parentId: null, name: 'Mine' }),
    await viewer(updateFile, { spaceId, fileId: reports.id, name: 'Mine' }),
    await viewer(moveFile, { spaceId, fileId: reports.id, parentId: null }),
    await viewer(trashFile, { spaceId, fileId: reports.id }),
    await viewer(restoreFile, { spaceId, fileId: trashed.id })
  ];
  assert.deepEqual(
    writes.map((result) => !result.ok && result.code),
    writes.map(() => 'FORBIDDEN')
  );
  assert.deepEqual(await namesIn(ada, spaceId, null), ['Reports']);

  const editor = api.as(edsger);
  const made = await editor(createFolder, { spaceId, parentId: reports.id, name: '2026' });
  assert.ok(made.ok);
  const changes = [
    await editor(updateFile, { spaceId, fileId: made.data.file.id, name: '2027' }),
    await editor(moveFile, { spaceId, fileId: made.data.file.id, parentId: null }),
    await editor(trashFile, { spaceId, fileId: made.data.file.id }),
    await editor(restoreFile, { spaceId, fileId: made.data.file.id })
  ];
  assert.deepEqual(
    changes.map((result) => result.ok),
    [true, true, true, true]
  );
  assert.equal(await pathOf(ada, spaceId, made.data.file.id), '/2027');
});

test('an agent works on files as its person: a read-only key reads, a read-write key also changes', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const keyOf = async (permission: 'read' | 'write') => {
    const made = await api.as(ada)(createApiKey, { name: 'Research agent', permission });
    assert.ok(made.ok);
    return api.withKey(made.data.apiKey.key);
  };
  const reader = await keyOf('read');
  const writer = await keyOf('write');

  assert.equal((await reader(getFiles, { spaceId, parentId: null })).ok, true);
  assert.equal((await reader(getFileByPath, { spaceId, path: '/Reports' })).ok, true);
  const refused = [
    await reader(createFolder, { spaceId, parentId: null, name: 'By the agent' }),
    await reader(updateFile, { spaceId, fileId: reports.id, description: 'By the agent' }),
    await reader(moveFile, { spaceId, fileId: reports.id, parentId: null }),
    await reader(trashFile, { spaceId, fileId: reports.id })
  ];
  assert.deepEqual(
    refused.map((result) => !result.ok && result.code),
    refused.map(() => 'FORBIDDEN')
  );

  const made = await writer(createFolder, { spaceId, parentId: reports.id, name: 'By the agent' });
  assert.equal(made.ok && made.data.file.path, '/Reports/By the agent');
  const described = await writer(updateFile, { spaceId, fileId: reports.id, description: 'Checked by the agent.' });
  assert.equal(described.ok && described.data.file.description, 'Checked by the agent.');
  // What the agent made is the person's
  const [row] = await api.db.select().from(files).where(eq(files.name, 'By the agent'));
  assert.equal(row?.userId, ada.id);
});

test('the files of a space do not exist for someone who is not a member, and signed out nobody is asked', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');

  for (const [caller, code] of [
    [api.as(grace), 'UNKNOWN_SPACE'],
    [api.as(null), 'UNAUTHENTICATED']
  ] as const) {
    const results = [
      await caller(getFiles, { spaceId, parentId: null }),
      await caller(getFile, { spaceId, fileId: reports.id }),
      await caller(getFileByPath, { spaceId, path: '/Reports' }),
      await caller(getTrashedFiles, { spaceId }),
      await caller(createFolder, { spaceId, parentId: null, name: 'Mine' }),
      await caller(updateFile, { spaceId, fileId: reports.id, name: 'Mine' }),
      await caller(moveFile, { spaceId, fileId: reports.id, parentId: null }),
      await caller(trashFile, { spaceId, fileId: reports.id }),
      await caller(restoreFile, { spaceId, fileId: reports.id })
    ];
    assert.deepEqual(
      results.map((result) => !result.ok && result.code),
      results.map(() => code)
    );
  }

  assert.deepEqual(await namesIn(ada, spaceId, null), ['Reports']);
});
