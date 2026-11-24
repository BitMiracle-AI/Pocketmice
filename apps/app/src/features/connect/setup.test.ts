// To run it, in apps/app: node --test src/features/connect/setup.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { KEY_VARIABLE, keyToHand, SKILL_URL, URL_VARIABLE, variableLines } from './setup.ts';
import { en } from './text/en.ts';
import { zhHans } from './text/zh-hans.ts';

/** The root of the repository, which is where the skill is kept */
const ROOT = new URL('../../../../../', import.meta.url);

test('the two variables are a line each, and the address has no slash at its end', () => {
  assert.equal(
    variableLines('https://api.example.com', 'pm_abc'),
    'POCKETMICE_URL=https://api.example.com\nPOCKETMICE_API_KEY=pm_abc'
  );
  assert.equal(
    variableLines('http://localhost:11210/', 'pm_abc').split('\n')[0],
    'POCKETMICE_URL=http://localhost:11210'
  );
});

test('the key an agent gets is the one picked, and the newest when none is picked or the picked one is gone', () => {
  const keys = [{ id: 'old' }, { id: 'middle' }, { id: 'new' }];
  assert.equal(keyToHand(keys, 'middle')?.id, 'middle');
  assert.equal(keyToHand(keys, null)?.id, 'new');
  assert.equal(keyToHand(keys, 'deleted')?.id, 'new');
  assert.equal(keyToHand([], null), null);
  assert.equal(keyToHand([], 'deleted'), null);
});

test('the message carries the address of the skill and both variables, in every language', () => {
  const variables = variableLines('https://api.example.com', 'pm_abc');
  for (const text of [en, zhHans]) {
    const lines = text.message(SKILL_URL, variables).split('\n');
    assert.ok(lines.includes(SKILL_URL), 'the address of the skill is a line of its own');
    assert.ok(lines.includes('POCKETMICE_URL=https://api.example.com'));
    assert.ok(lines.includes('POCKETMICE_API_KEY=pm_abc'));
  }
});

test('the variables are the ones the skill reads, and the address leads to the skill of this repository', () => {
  const folder = /^https:\/\/github\.com\/BitMiracle-AI\/Pocketmice\/tree\/main\/(.+)$/.exec(SKILL_URL)?.[1];
  assert.ok(folder, 'the address is a folder of the released branch on GitHub');
  const skill = readFileSync(new URL(`${folder}/SKILL.md`, ROOT), 'utf8');
  for (const variable of [URL_VARIABLE, KEY_VARIABLE]) {
    assert.ok(skill.includes(`- \`${variable}\`:`), `the skill lists ${variable} among the variables it reads`);
  }
  // Every variable the skill lists is one the message gives: a third one would leave the agent asking for it
  const listed = [...skill.matchAll(/^- `(POCKETMICE_[A-Z_]+)`:/gm)].map((match) => match[1]);
  assert.deepEqual(listed, [URL_VARIABLE, KEY_VARIABLE]);
});
