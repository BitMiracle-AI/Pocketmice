import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { id } from './id.ts';
import { isOperation, operation, operationPath } from './operation.ts';

/** A definition that is right in every respect, with the given name */
function named(name: string) {
  return operation({
    name,
    description: 'An operation of the tests.',
    kind: name.startsWith('get') ? 'read' : 'write',
    access: 'public',
    belongsTo: 'none',
    input: z.object({}),
    output: z.object({}),
    errors: []
  });
}

test('a name that is a verb followed by a noun in camelCase is accepted', () => {
  for (const name of ['getServerInfo', 'getSpaceMembers', 'leaveSpace', 'getS3Settings']) {
    assert.equal(named(name).name, name);
  }
});

test('a name of one word, or not in camelCase, is refused when the operation is defined', () => {
  for (const name of ['health', 'auth', 'get', 'GetProfile', 'get_profile', 'get-profile', 'getProfile!', '1get', '']) {
    assert.throws(() => named(name), /Operation name ".*" is invalid/, `"${name}" should be refused`);
  }
});

test('a name that says read on a write, or a read whose name does not say so, is refused: a read-only key goes by the kind', () => {
  const define = (name: string, kind: 'read' | 'write') =>
    operation({
      name,
      description: 'An operation of the tests.',
      kind,
      access: 'public',
      belongsTo: 'none',
      input: z.object({}),
      output: z.object({}),
      errors: []
    });

  assert.equal(define('getThings', 'read').kind, 'read');
  assert.equal(define('deleteThing', 'write').kind, 'write');
  // A word that only begins with the letters g, e, t is not the verb get
  assert.equal(define('getawayCar', 'write').kind, 'write');

  assert.throws(() => define('deleteThing', 'read'), /Operation deleteThing is a read, and its name says otherwise/);
  assert.throws(() => define('getThings', 'write'), /Operation getThings is a write, and its name says otherwise/);
});

test('an operation says what it does: a definition whose description is empty is refused', () => {
  const define = (description: string) =>
    operation({
      name: 'getThing',
      description,
      kind: 'read',
      access: 'public',
      belongsTo: 'none',
      input: z.object({}),
      output: z.object({}),
      errors: []
    });

  assert.equal(define('One thing.').description, 'One thing.');
  for (const empty of ['', '   ', '\n']) {
    assert.throws(() => define(empty), /Operation getThing has no description/);
  }
});

test('an input field called id or ending in Id must be the shared id', () => {
  const define = (input: z.ZodObject) =>
    operation({
      name: 'getThing',
      description: 'An operation of the tests.',
      kind: 'read',
      access: 'public',
      belongsTo: 'none',
      input,
      output: z.object({}),
      errors: []
    });

  assert.throws(() => define(z.object({ id: z.string() })), /takes "id" in its input with its own rule/);
  assert.throws(() => define(z.object({ fileId: z.uuid() })), /takes "fileId" in its input with its own rule/);

  // The shared id itself is accepted, and so is a field that merely contains the letters
  define(z.object({ id, fileId: id, idea: z.string(), valid: z.boolean() }));

  // So is the shared id made nullable, for a field where null means "none" — and nothing else made nullable, nor
  // the shared id wrapped any other way
  define(z.object({ parentId: id.nullable() }));
  assert.throws(() => define(z.object({ parentId: z.uuid().nullable() })), /takes "parentId" in its input/);
  assert.throws(() => define(z.object({ parentId: id.optional() })), /takes "parentId" in its input/);
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
    description: 'An operation of the tests.',
    kind: 'read',
    access: 'public',
    belongsTo: 'none',
    input: z.object({}),
    output: z.object({}),
    // @ts-expect-error -- NO_SUCH_CODE is not in DECLARED_ERROR_STATUS
    errors: ['NOT_FOUND', 'NO_SUCH_CODE']
  });
});

test('an operation of a space is not public, takes a spaceId and states a role: a definition without one fails the type check', () => {
  // Right: the caller is known, the input says which space, and the lowest role is stated
  operation({
    name: 'getSpaceThings',
    description: 'An operation of the tests.',
    kind: 'read',
    access: 'authenticated',
    belongsTo: 'space',
    minRole: 'viewer',
    input: z.object({ spaceId: id }),
    output: z.object({}),
    errors: []
  });

  // Right as well: an operation of a space that an API key cannot call
  operation({
    name: 'deleteSpaceThings',
    description: 'An operation of the tests.',
    kind: 'write',
    access: 'session',
    belongsTo: 'space',
    minRole: 'owner',
    input: z.object({ spaceId: id }),
    output: z.object({}),
    errors: []
  });

  operation({
    name: 'getSpaceThings',
    description: 'An operation of the tests.',
    kind: 'read',
    // @ts-expect-error -- without knowing who is calling, membership cannot be checked
    access: 'public',
    belongsTo: 'space',
    minRole: 'viewer',
    input: z.object({ spaceId: id }),
    output: z.object({}),
    errors: []
  });

  operation({
    name: 'getSpaceThings',
    description: 'An operation of the tests.',
    kind: 'read',
    access: 'authenticated',
    belongsTo: 'space',
    minRole: 'viewer',
    // @ts-expect-error -- the input does not say which space
    input: z.object({ folderId: id }),
    output: z.object({}),
    errors: []
  });

  // @ts-expect-error -- it does not say which members may call it
  operation({
    name: 'getSpaceThings',
    description: 'An operation of the tests.',
    kind: 'read',
    access: 'authenticated',
    belongsTo: 'space',
    input: z.object({ spaceId: id }),
    output: z.object({}),
    errors: []
  });

  operation({
    name: 'getSpaceThings',
    description: 'An operation of the tests.',
    kind: 'read',
    access: 'authenticated',
    belongsTo: 'space',
    // @ts-expect-error -- there is no such role
    minRole: 'admin',
    input: z.object({ spaceId: id }),
    output: z.object({}),
    errors: []
  });
});

test('an operation that belongs to no space states no role: one that does fails the type check', () => {
  operation({
    name: 'getThings',
    description: 'An operation of the tests.',
    kind: 'read',
    access: 'authenticated',
    belongsTo: 'none',
    // @ts-expect-error -- there is no space to have a role in
    minRole: 'viewer',
    input: z.object({}),
    output: z.object({}),
    errors: []
  });
});
