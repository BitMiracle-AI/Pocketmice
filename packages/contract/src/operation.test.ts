import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { id } from './id.ts';
import { isOperation, operation, operationPath } from './operation.ts';

/** A definition that is right in every respect, with the given name */
function named(name: string) {
  return operation({ name, kind: 'read', input: z.object({}), output: z.object({}), errors: [] });
}

test('a name that is a verb followed by a noun in camelCase is accepted', () => {
  for (const name of ['getServerInfo', 'getTeamMembers', 'leaveTeam', 'getS3Settings']) {
    assert.equal(named(name).name, name);
  }
});

test('a name of one word, or not in camelCase, is refused when the operation is defined', () => {
  for (const name of ['health', 'get', 'GetProfile', 'get_profile', 'get-profile', 'getProfile!', '1getProfile', '']) {
    assert.throws(() => named(name), /Operation name ".*" is invalid/, `"${name}" should be refused`);
  }
});

test('an input field called id or ending in Id must be the shared id', () => {
  const define = (input: z.ZodObject) =>
    operation({ name: 'getThing', kind: 'read', input, output: z.object({}), errors: [] });

  assert.throws(() => define(z.object({ id: z.string() })), /takes "id" in its input with its own rule/);
  assert.throws(() => define(z.object({ teamId: z.uuid() })), /takes "teamId" in its input with its own rule/);

  // The shared id itself is accepted, and so is a field that merely contains the letters
  define(z.object({ id, teamId: id, idea: z.string(), valid: z.boolean() }));
});

test('the address of an operation is /api/ followed by its name', () => {
  assert.equal(operationPath(named('getServerInfo')), '/api/getServerInfo');
});

test('isOperation tells a definition apart from the other things a file exports', () => {
  assert.equal(isOperation(named('getServerInfo')), true);

  for (const other of [null, undefined, 'getServerInfo', 42, {}, { name: 'getServerInfo' }, z.object({}), id]) {
    assert.equal(isOperation(other), false);
  }
});

test('an operation only lists error codes that exist: a made-up code fails the type check', () => {
  operation({
    name: 'getThing',
    kind: 'read',
    input: z.object({}),
    output: z.object({}),
    // @ts-expect-error -- NO_SUCH_CODE is not in DECLARED_ERROR_STATUS
    errors: ['NOT_FOUND', 'NO_SUCH_CODE']
  });
});
