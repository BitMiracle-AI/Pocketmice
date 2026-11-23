import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { isOperation, type Operation } from '@pocketmice/contract/operation';
import type { Db } from '@pocketmice/db';
import type { FileStorage } from '../storage/fileStorage.ts';
import { domainImplementations } from './implementations.ts';

// The folder of the contract that holds the definitions. The path is not written out relative to this file: where
// the contract's files are is asked of the same rules that resolve an import of it
const DEFINITIONS_DIR = new URL('./domains/', import.meta.resolve('@pocketmice/contract/operation'));

/** An operation the contract defines: the name of the constant that exports it, and the file it is in */
interface Defined {
  operation: Operation;
  exportName: string;
  file: string;
}

/** Every operation the contract defines, by name */
async function definedOperations(): Promise<Map<string, Defined>> {
  const defined = new Map<string, Defined>();
  const files = readdirSync(DEFINITIONS_DIR, { recursive: true, encoding: 'utf8' });

  for (const file of files.filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts')).sort()) {
    const exported: Record<string, unknown> = await import(new URL(file, DEFINITIONS_DIR).href);
    for (const [exportName, value] of Object.entries(exported)) {
      if (!isOperation(value)) continue;
      assert.equal(defined.has(value.name), false, `${value.name} is defined more than once in the contract`);
      defined.set(value.name, { operation: value, exportName, file });
    }
  }
  return defined;
}

// An implementation does not touch the database or the storage until it is called, and this file only looks at the
// list, so neither has to be real
const implementations = domainImplementations({
  db: {} as Db,
  storage: {} as FileStorage,
  version: '1.2.3',
  reportError: () => {}
});

test('every operation the contract defines has an implementation in the api', async () => {
  const defined = await definedOperations();
  assert.ok(defined.size > 0, `found no operation defined under ${DEFINITIONS_DIR.pathname}`);

  const implemented = new Set(implementations.map((implementation) => implementation.operation));
  const missing = [...defined].filter(([, { operation }]) => !implemented.has(operation));

  assert.deepEqual(
    missing.map(([name, { file }]) => `${name} (${file})`),
    [],
    'these operations are defined in the contract but not listed in domains/implementations.ts'
  );
});

test('every operation the api implements is the one the contract defines, not a definition of its own', async () => {
  const defined = new Set([...(await definedOperations()).values()].map(({ operation }) => operation));

  const strangers = implementations.filter((implementation) => !defined.has(implementation.operation));

  assert.deepEqual(
    strangers.map((implementation) => implementation.operation.name),
    []
  );
});

test('the constant that exports a definition has the name of the operation', async () => {
  for (const { operation, exportName, file } of (await definedOperations()).values()) {
    assert.equal(operation.name, exportName, `${exportName} in ${file}`);
  }
});
