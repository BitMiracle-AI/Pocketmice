import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSkill, operationsNamedIn } from './checkSkill.mjs';

const OPERATIONS = [
  { name: 'getServerInfo', access: 'public' },
  { name: 'getFiles', access: 'authenticated' },
  { name: 'createFolder', access: 'authenticated' },
  { name: 'deleteFile', access: 'session' }
];

const SKILL = 'Call `getServerInfo`, then `pm getFiles` and POST /api/createFolder.';

test('a skill that names every operation an API key may call, and no other, has no problems', () => {
  assert.deepEqual(checkSkill(SKILL, OPERATIONS), []);
});

test('an operation is found however it is written: in backticks, in a command, in an address, in a table', () => {
  const text = "`getFiles`\npm createFolder '{}'\n$URL/api/getServerInfo\n| deleteFile | write |";

  assert.deepEqual([...operationsNamedIn(text, OPERATIONS)].sort(), [
    'createFolder',
    'deleteFile',
    'getFiles',
    'getServerInfo'
  ]);
});

test('the name of a field is not taken for an operation, also one that begins like a verb', () => {
  const text = 'spaceId, parentId, baseVersionId, nextCursor, createdAt, deletedAt, getting, create';

  assert.deepEqual([...operationsNamedIn(text, OPERATIONS)], []);
});

test('an operation an API key may call that the skill does not name is reported, public ones too', () => {
  const problems = checkSkill('Only `getFiles` is here.', OPERATIONS);

  assert.equal(problems.length, 2);
  assert.match(problems[0], /does not name getServerInfo, which an API key may call/);
  assert.match(problems[1], /does not name createFolder, which an API key may call/);
});

test('an operation only a signed-in person may call need not be named, and is reported when it is', () => {
  assert.deepEqual(checkSkill(SKILL, OPERATIONS), []);

  const problems = checkSkill(`${SKILL} Then \`deleteFile\`.`, OPERATIONS);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /names deleteFile, which no API key may call \(its access is session\)/);
});

test('a name the contract does not have is reported: the old name of an operation that was renamed', () => {
  const renamed = OPERATIONS.map((operation) =>
    operation.name === 'getFiles' ? { ...operation, name: 'getEntries' } : operation
  );

  const problems = checkSkill(SKILL, renamed);

  assert.equal(problems.length, 2);
  assert.match(problems[0], /names getFiles, which is not an operation of the contract/);
  assert.match(problems[1], /does not name getEntries/);
});
