import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkAgentsFile, countCharacters, LIMITS } from './checkAgentsFile.mjs';

const SMALL = { file: 20, line: 8 };

/**
 * Builds a temporary repo that holds only a copy of the script, in scripts/ as in the real one: the script looks for
 * AGENTS.md one level above its own folder, so the copy checks the temporary repo and not this one.
 * Returns the repo and a function that runs the script and returns what it printed (it throws if the script fails).
 */
function repoWithScript(t) {
  // realpathSync: the script only runs its check when the path it was started with is its own resolved path, and
  // the system's temporary folder can sit behind a symlink
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pocketmice-agents-file-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const script = join(root, 'scripts/checkAgentsFile.mjs');
  mkdirSync(join(root, 'scripts'));
  copyFileSync(new URL('./checkAgentsFile.mjs', import.meta.url), script);
  return { root, run: () => execFileSync(process.execPath, [script], { encoding: 'utf8' }) };
}

test('a file within the limit, with every line within the limit, has no problems', () => {
  assert.deepEqual(checkAgentsFile('# Rules\n\n- one\n- two\n', SMALL), []);
});

test('a line over the limit: the message says which line, how many characters it has and where the text should go', () => {
  const problems = checkAgentsFile('# Rule\n- a long line\n', SMALL);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /^AGENTS\.md line 2 has 13 characters, over the limit of 8 for one line\./);
  assert.match(problems[0], /comments of the file that owns it/);
});

test('a file over the limit: the message says how many characters it has, also when no single line is over', () => {
  const problems = checkAgentsFile('- first\n- again\n- third\n', SMALL);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /^AGENTS\.md has 21 characters, over the limit of 20\./);
});

test('lines over the limit in a file over the limit: both are reported', () => {
  const problems = checkAgentsFile('- a long line\n- another one\n', SMALL);

  assert.deepEqual(
    problems.map((problem) => problem.slice(0, 20)),
    ['AGENTS.md line 1 has', 'AGENTS.md line 2 has', 'AGENTS.md has 26 cha']
  );
});

test('characters are counted, not bytes or code units: a CJK character, a letter and an emoji each count as one, a line break as none', () => {
  assert.equal(countCharacters('字a\n😀'), 3);
  assert.deepEqual(checkAgentsFile('abcdefg😀', SMALL), []);
});

test('run as a script in a repo without AGENTS.md: says there is nothing to check and exits successfully', (t) => {
  // AGENTS.md is not committed, so this is what a fresh clone looks like
  const { run } = repoWithScript(t);

  assert.equal(run(), 'AGENTS.md is not present: nothing to check\n');
});

test('run as a script in a repo with AGENTS.md: checks the file', (t) => {
  const { root, run } = repoWithScript(t);
  writeFileSync(join(root, 'AGENTS.md'), '# Rules\n\n- one\n');

  assert.equal(run(), `AGENTS.md length check passed (12 of ${LIMITS.file} characters)\n`);
});
