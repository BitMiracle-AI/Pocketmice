// Checks that the agent skill (skills/pocketmice/SKILL.md) and the contract name the same operations.
// The skill is what an agent with an API key is given to work from: it tells the agent which operations there are
// and how to call them. That list is a copy of the contract, written in words. When an operation is renamed, added
// or closed to API keys and the skill is not changed with it, nothing else fails: the first to find out is an agent
// that calls a name the server does not have, and it cannot fix the file it was given.
// The rules: every operation the skill names is one the contract defines and an API key may call; and every
// operation an API key may call is named in the skill.
// What the skill says about an operation (its input, its answer, its error codes) is not checked: only the names.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL = 'skills/pocketmice/SKILL.md';

/** A word in camelCase of two words or more, split into its first word and the rest: getFiles, baseVersionId */
const CAMEL_CASE_WORD = /\b([a-z]+)(?:[A-Z][a-z0-9]*)+\b/g;

/**
 * The words of text that read as the name of an operation: a camelCase word whose first word is a verb some
 * operation begins with. operations are the ones the contract defines, and the verbs are taken from their names.
 * So getFiles and deleteFile are read as operations, also one the contract does not have, like getFolders; and the
 * names of fields are not: baseVersionId, nextCursor, and createdAt, whose first word is "created".
 */
export function operationsNamedIn(text, operations) {
  const verbs = new Set(operations.map(({ name }) => /^[a-z]+/.exec(name)?.[0]));
  const named = new Set();
  for (const [word, first] of text.matchAll(CAMEL_CASE_WORD)) {
    if (verbs.has(first)) named.add(word);
  }
  return named;
}

/**
 * Checks the text of the skill against the operations of the contract, each given as its name and its access.
 * Returns one message for each operation that is named on one side only, or an empty array if there are none.
 */
export function checkSkill(text, operations) {
  const named = operationsNamedIn(text, operations);
  const byName = new Map(operations.map((operation) => [operation.name, operation]));
  const problems = [];

  for (const name of [...named].sort()) {
    const operation = byName.get(name);
    if (!operation) {
      problems.push(
        `${SKILL} names ${name}, which is not an operation of the contract. If the operation was renamed, change its name here too.`
      );
    } else if (operation.access === 'session') {
      problems.push(
        `${SKILL} names ${name}, which no API key may call (its access is session). The skill is for a caller with an API key: say in words what only the person does.`
      );
    }
  }
  for (const { name, access } of operations) {
    if (access !== 'session' && !named.has(name)) {
      problems.push(
        `${SKILL} does not name ${name}, which an API key may call. Add it to the list of operations in the skill.`
      );
    }
  }
  return problems;
}

/** Every operation the contract under root defines: its name and who may call it */
async function definedOperations(root) {
  const contract = resolve(root, 'packages/contract/src');
  const { isOperation } = await import(pathToFileURL(resolve(contract, 'operation.ts')).href);
  const files = readdirSync(resolve(contract, 'domains'), { recursive: true, encoding: 'utf8' });

  const operations = [];
  for (const file of files.filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts')).sort()) {
    const exported = await import(pathToFileURL(resolve(contract, 'domains', file)).href);
    for (const value of Object.values(exported)) {
      if (isOperation(value)) operations.push({ name: value.name, access: value.access });
    }
  }
  return operations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '../..');
  const operations = await definedOperations(root);
  if (operations.length === 0) {
    console.error(
      'Found no operation defined under packages/contract/src/domains: nothing to check the skill against.'
    );
    process.exit(1);
  }

  const problems = checkSkill(readFileSync(resolve(root, SKILL), 'utf8'), operations);
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);

  const callable = operations.filter(({ access }) => access !== 'session').length;
  console.log(`Skill check passed (${callable} operations an API key may call, all named in ${SKILL})`);
}
