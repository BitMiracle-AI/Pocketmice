import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiKey } from '@pocketmice/contract/domains/apiKey';
import {
  createFolder,
  FILE_CONTENT_PATH,
  getMatchingFiles,
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

/** A file as these tests use it */
interface Made {
  id: string;
  name: string;
  path: string;
  version: { id: string } | null;
}

/** Makes a space as this person and returns its id */
async function makeSpace(owner: CurrentUser, name = 'Research notes') {
  const result = await api.as(owner)(createSpace, { name });
  assert.ok(result.ok, `createSpace should have worked: ${JSON.stringify(result)}`);
  return result.data.space.id;
}

/** Makes a folder as this person, in the folder parentId or directly in the space, and returns it */
async function makeFolder(
  person: CurrentUser,
  spaceId: string,
  parentId: string | null,
  name: string,
  description = ''
): Promise<Made> {
  const result = await api.as(person)(createFolder, { spaceId, parentId, name, description });
  assert.ok(result.ok, `createFolder "${name}" should have worked: ${JSON.stringify(result)}`);
  return result.data.file;
}

/** Sends content to the address it goes through; the query says whether it is a new file or a new version */
async function put(person: CurrentUser, query: Record<string, string>, content: string): Promise<Made> {
  const body = Buffer.from(content);
  const response = await api.send(person, `${FILE_CONTENT_PATH}?${new URLSearchParams(query)}`, {
    method: 'PUT',
    headers: { 'content-length': String(body.length) },
    body
  });
  const answer = (await response.json()) as { file: Made };
  assert.equal(response.status, 200, `the upload should have worked: ${JSON.stringify(answer)}`);
  return answer.file;
}

/** Uploads a file as this person, into the folder parentId or directly into the space, and returns it */
function makeFile(person: CurrentUser, spaceId: string, parentId: string | null, name: string, content = 'x') {
  return put(person, { spaceId, name, ...(parentId !== null && { parentId }) }, content);
}

/** Puts a file in the trash as this person */
async function trash(person: CurrentUser, spaceId: string, fileId: string) {
  const result = await api.as(person)(trashFile, { spaceId, fileId });
  assert.deepEqual(result, { ok: true, data: {} });
}

/**
 * Says when files last changed: the first long ago, each one after it a day later, so the last is the latest.
 * The tests of the order decide the times this way, where waiting between two writes would only make them likely.
 */
async function changedInThisOrder(...made: Made[]) {
  for (const [index, file] of made.entries()) {
    const day = String(index + 1).padStart(2, '0');
    await api.db
      .update(files)
      .set({ updatedAt: new Date(`2026-01-${day}T00:00:00.000Z`) })
      .where(eq(files.id, file.id));
  }
}

/** What a person finds, looking for these words: the paths, in the order of the answer */
async function found(
  person: CurrentUser,
  spaceId: string,
  query: string,
  where: { folderId?: string | null; kind?: 'file' | 'folder' } = {}
) {
  const result = await api.as(person)(getMatchingFiles, { spaceId, folderId: null, query, ...where });
  assert.ok(result.ok, `getMatchingFiles "${query}" should have worked: ${JSON.stringify(result)}`);
  assert.equal(result.data.nextCursor, null, `"${query}" should have fitted on one page`);
  return result.data.files.map((file) => file.path);
}

test('a file is found by a word of its name or of its description, in capitals or not, with its path and its content', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports', 'One folder for each quarter');
  const summary = await makeFile(ada, spaceId, reports.id, 'Q3-Summary.pdf');
  const notes = await makeFile(ada, spaceId, null, 'notes.txt');
  await api.as(ada)(updateFile, { spaceId, fileId: notes.id, description: 'What the board said in the SUMMER' });
  await changedInThisOrder(reports, summary, notes);

  const result = await api.as(ada)(getMatchingFiles, { spaceId, folderId: null, query: 'sum' });

  // The file is the same one getFile answers with: its path worked out, and its content now
  assert.ok(result.ok);
  assert.deepEqual(
    result.data.files.map((file) => [file.path, file.kind, file.parentId, file.version?.id ?? null]),
    [
      ['/notes.txt', 'file', null, notes.version?.id],
      ['/Reports/Q3-Summary.pdf', 'file', reports.id, summary.version?.id]
    ]
  );
  assert.deepEqual(await found(ada, spaceId, 'SUMMARY'), ['/Reports/Q3-Summary.pdf']);
  // A folder is found like a file, and by its description too
  assert.deepEqual(await found(ada, spaceId, 'quarter'), ['/Reports']);
  // Finding nothing is an answer, not a failure
  assert.deepEqual(await found(ada, spaceId, 'invoice'), []);
});

test('every word has to be there, in the name or in the description, whatever kind of space is between the words', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const both = await makeFolder(ada, spaceId, null, 'Q3 总结.docx', '给董事会的报告');
  const nameOnly = await makeFolder(ada, spaceId, null, 'Q3 报告.docx');
  const half = await makeFolder(ada, spaceId, null, 'Q3 plan.docx');
  await changedInThisOrder(half, nameOnly, both);

  // One word in the name and the other in the description is a match; one word of the two is not
  assert.deepEqual(await found(ada, spaceId, 'q3 报告'), ['/Q3 总结.docx', '/Q3 报告.docx']);
  assert.deepEqual(await found(ada, spaceId, '报告 q3'), ['/Q3 总结.docx', '/Q3 报告.docx']);
  // A tab, several spaces, and the wide space of Chinese typing all separate words
  assert.deepEqual(await found(ada, spaceId, ' q3\t  报告　docx '), ['/Q3 总结.docx', '/Q3 报告.docx']);
  assert.deepEqual(await found(ada, spaceId, 'q3 董事会 plan'), []);
  // Words are looked for one by one: "Q3 plan" in a name is found by "plan q3", and "q3plan" is another word
  assert.deepEqual(await found(ada, spaceId, 'plan q3'), ['/Q3 plan.docx']);
  assert.deepEqual(await found(ada, spaceId, 'q3plan'), []);
});

test('a word is looked for as it is written: %, _ and \\ stand for themselves', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  for (const name of ['100%.txt', '1000.txt', 'a_b.txt', 'axb.txt', 'back\\slash.txt', 'backslash.txt']) {
    await makeFolder(ada, spaceId, null, name);
  }

  assert.deepEqual(await found(ada, spaceId, '100%'), ['/100%.txt']);
  assert.deepEqual(await found(ada, spaceId, '%'), ['/100%.txt']);
  assert.deepEqual(await found(ada, spaceId, 'a_b'), ['/a_b.txt']);
  assert.deepEqual(await found(ada, spaceId, '_'), ['/a_b.txt']);
  assert.deepEqual(await found(ada, spaceId, 'k\\s'), ['/back\\slash.txt']);
  assert.deepEqual(await found(ada, spaceId, '\\'), ['/back\\slash.txt']);
});

test('what a file holds is not looked at, nor the names of the folders it is in', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const budget = await makeFolder(ada, spaceId, null, 'Budget');
  await makeFile(ada, spaceId, budget.id, 'notes.txt', 'The budget of 2026 is in here.');

  assert.deepEqual(await found(ada, spaceId, 'budget'), ['/Budget']);
  assert.deepEqual(await found(ada, spaceId, '2026'), []);
});

test('what is in the trash is not found: neither a trashed file nor anything in a trashed folder, until it is restored', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const archive = await makeFolder(ada, spaceId, null, 'Archive');
  const year = await makeFolder(ada, spaceId, archive.id, '2025');
  const deep = await makeFile(ada, spaceId, year.id, 'report-deep.md');
  const alone = await makeFile(ada, spaceId, null, 'report-alone.md');
  const kept = await makeFile(ada, spaceId, null, 'report-kept.md');
  await changedInThisOrder(kept, alone, deep);

  await trash(ada, spaceId, alone.id);
  await trash(ada, spaceId, archive.id);

  // Only the folder was marked: the file two folders down has no mark of its own, and is not found either
  assert.deepEqual(await found(ada, spaceId, 'report'), ['/report-kept.md']);
  assert.deepEqual(await found(ada, spaceId, '2025'), []);

  const back = await api.as(ada)(restoreFile, { spaceId, fileId: archive.id });
  assert.ok(back.ok);
  assert.deepEqual(await found(ada, spaceId, 'report'), ['/Archive/2025/report-deep.md', '/report-kept.md']);
});

test('a page is as long as asked while there is more to find, however much of the trash lies in between', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const old = await makeFolder(ada, spaceId, null, 'Old');
  const live = [await makeFolder(ada, spaceId, null, 'plan-1'), await makeFolder(ada, spaceId, null, 'plan-2')];
  // The four changed last are all in the trash, in a folder that was trashed
  const trashed = [];
  for (const name of ['plan-3', 'plan-4', 'plan-5', 'plan-6'])
    trashed.push(await makeFolder(ada, spaceId, old.id, name));
  await changedInThisOrder(...live, ...trashed);
  await trash(ada, spaceId, old.id);

  const result = await api.as(ada)(getMatchingFiles, { spaceId, folderId: null, query: 'plan', limit: 2 });

  assert.ok(result.ok);
  assert.deepEqual(
    result.data.files.map((file) => file.path),
    ['/plan-2', '/plan-1']
  );
  assert.equal(result.data.nextCursor, null);
});

test('with folderId only what is in that folder and the folders inside it is found, and not the folder itself', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const clients = await makeFolder(ada, spaceId, null, 'Clients', 'Every contract we signed');
  const acme = await makeFolder(ada, spaceId, clients.id, 'Acme contract');
  const inAcme = await makeFile(ada, spaceId, acme.id, 'contract-2026.pdf');
  const inClients = await makeFile(ada, spaceId, clients.id, 'contract-template.docx');
  const outside = await makeFile(ada, spaceId, null, 'contract-draft.md');
  await changedInThisOrder(clients, acme, inAcme, inClients, outside);

  assert.deepEqual(await found(ada, spaceId, 'contract'), [
    '/contract-draft.md',
    '/Clients/contract-template.docx',
    '/Clients/Acme contract/contract-2026.pdf',
    '/Clients/Acme contract',
    '/Clients'
  ]);
  assert.deepEqual(await found(ada, spaceId, 'contract', { folderId: clients.id }), [
    '/Clients/contract-template.docx',
    '/Clients/Acme contract/contract-2026.pdf',
    '/Clients/Acme contract'
  ]);
  assert.deepEqual(await found(ada, spaceId, 'contract', { folderId: acme.id }), [
    '/Clients/Acme contract/contract-2026.pdf'
  ]);
});

test('NOT_FOUND when folderId is no folder of the space: there is none, it is in the trash, it is a file, or it is in another space', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const otherSpaceId = await makeSpace(ada, 'Another space');
  const gone = await makeFolder(ada, spaceId, null, 'Gone');
  const inGone = await makeFolder(ada, spaceId, gone.id, 'Inside');
  const aFile = await makeFile(ada, spaceId, null, 'notes.txt');
  const elsewhere = await makeFolder(ada, otherSpaceId, null, 'Elsewhere');
  await trash(ada, spaceId, gone.id);

  for (const folderId of [NOBODY, gone.id, inGone.id, aFile.id, elsewhere.id]) {
    const result = await api.as(ada)(getMatchingFiles, { spaceId, folderId, query: 'notes' });
    assert.equal(!result.ok && result.code, 'NOT_FOUND', folderId);
  }
});

test('with kind only files are found, or only folders', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const folder = await makeFolder(ada, spaceId, null, 'Invoices');
  const file = await makeFile(ada, spaceId, folder.id, 'invoice-0042.pdf');
  await changedInThisOrder(folder, file);

  assert.deepEqual(await found(ada, spaceId, 'invoice'), ['/Invoices/invoice-0042.pdf', '/Invoices']);
  assert.deepEqual(await found(ada, spaceId, 'invoice', { kind: 'folder' }), ['/Invoices']);
  assert.deepEqual(await found(ada, spaceId, 'invoice', { kind: 'file' }), ['/Invoices/invoice-0042.pdf']);
});

test('the latest changed comes first, and the pages go through every match once', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const made = [];
  for (const name of ['draft-c', 'draft-a', 'draft-e', 'draft-b', 'draft-d']) {
    made.push(await makeFolder(ada, spaceId, null, name));
  }
  await changedInThisOrder(...made);

  const pages = [];
  let cursor: string | undefined;
  do {
    const result = await api.as(ada)(getMatchingFiles, { spaceId, folderId: null, query: 'draft', limit: 2, cursor });
    assert.ok(result.ok, `page ${pages.length + 1} should have worked: ${JSON.stringify(result)}`);
    pages.push(result.data.files.map((file) => file.name));
    cursor = result.data.nextCursor ?? undefined;
  } while (cursor !== undefined);

  // The order they were changed in, backwards: not the order of the names
  assert.deepEqual(pages, [['draft-d', 'draft-b'], ['draft-e', 'draft-a'], ['draft-c']]);
  // A page that holds the last match says so, also when it is full
  const all = await api.as(ada)(getMatchingFiles, { spaceId, folderId: null, query: 'draft', limit: 5 });
  assert.equal(all.ok && all.data.nextCursor, null);
  const notOne = await api.as(ada)(getMatchingFiles, { spaceId, folderId: null, query: 'draft', cursor: 'x' });
  assert.equal(!notOne.ok && notOne.code, 'INVALID_INPUT');
});

test('files changed in the same millisecond are each on one page, and on no other', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const made = [];
  for (const name of ['copy-1', 'copy-2', 'copy-3', 'copy-4']) made.push(await makeFolder(ada, spaceId, null, name));
  await api.db
    .update(files)
    .set({ updatedAt: new Date('2026-01-01T00:00:00.000Z') })
    .where(eq(files.spaceId, spaceId));

  const seen = [];
  let cursor: string | undefined;
  do {
    const result = await api.as(ada)(getMatchingFiles, { spaceId, folderId: null, query: 'copy', limit: 1, cursor });
    assert.ok(result.ok);
    seen.push(...result.data.files.map((file) => file.name));
    cursor = result.data.nextCursor ?? undefined;
  } while (cursor !== undefined);

  assert.deepEqual(seen.toSorted(), ['copy-1', 'copy-2', 'copy-3', 'copy-4']);
});

test('a new name, a new description, a new place and new content bring a file to the front; the trash does not', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const folder = await makeFolder(ada, spaceId, null, 'Elsewhere');
  const target = await makeFile(ada, spaceId, null, 'memo-target.md');
  const others = [await makeFolder(ada, spaceId, null, 'memo-1'), await makeFolder(ada, spaceId, null, 'memo-2')];
  const call = api.as(ada);
  const fileId = target.id;

  const changes: [string, () => Promise<unknown>][] = [
    ['a new name', () => call(updateFile, { spaceId, fileId, name: 'memo-renamed.md' })],
    ['a new description', () => call(updateFile, { spaceId, fileId, description: 'For the board' })],
    ['a new place', () => call(moveFile, { spaceId, fileId, parentId: folder.id })],
    ['new content', () => put(ada, { spaceId, fileId, baseVersionId: target.version?.id ?? '' }, 'More')]
  ];
  for (const [what, change] of changes) {
    // The file is the one changed longest ago, until it is changed
    await changedInThisOrder(target, ...others);
    assert.match((await found(ada, spaceId, 'memo')).at(-1) ?? '', /memo-(target|renamed)\.md$/, what);
    await change();
    assert.match((await found(ada, spaceId, 'memo'))[0] ?? '', /memo-renamed\.md$/, what);
  }

  // Going into the trash and coming back is not a change: it is found where it was
  await changedInThisOrder(target, ...others);
  await trash(ada, spaceId, fileId);
  const back = await call(restoreFile, { spaceId, fileId });
  assert.ok(back.ok);
  assert.deepEqual(await found(ada, spaceId, 'memo'), ['/memo-2', '/memo-1', '/Elsewhere/memo-renamed.md']);
});

test('a viewer looks, and so does a read-only key; what is in another space is not found, and a space one is not in is unknown', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const edsger = await api.addPerson('Edsger');
  const spaceId = await makeSpace(ada);
  const otherSpaceId = await makeSpace(ada, 'Another space');
  await api.db.insert(spaceMembers).values({ spaceId, userId: grace.id, role: 'viewer' });
  await makeFolder(ada, spaceId, null, 'Minutes');
  await makeFolder(ada, otherSpaceId, null, 'Minutes of the other space');
  const key = await api.as(grace)(createApiKey, { name: 'Reading agent', permission: 'read' });
  assert.ok(key.ok);

  for (const call of [api.as(grace), api.withKey(key.data.apiKey.key)]) {
    const result = await call(getMatchingFiles, { spaceId, folderId: null, query: 'minutes' });
    assert.deepEqual(result.ok && result.data.files.map((file) => file.path), ['/Minutes']);
  }
  // Grace is not in the other space, and Edsger is in neither
  const outside = await api.as(grace)(getMatchingFiles, { spaceId: otherSpaceId, folderId: null, query: 'minutes' });
  assert.equal(!outside.ok && outside.code, 'UNKNOWN_SPACE');
  const stranger = await api.as(edsger)(getMatchingFiles, { spaceId, folderId: null, query: 'minutes' });
  assert.equal(!stranger.ok && stranger.code, 'UNKNOWN_SPACE');
});
