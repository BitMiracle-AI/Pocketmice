import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DECLARED_ERROR_STATUS, ERROR_STATUS, isUniversalErrorCode, UNIVERSAL_ERROR_STATUS } from './errors.ts';

test('no code is both universal and declared: the two lists are merged into one, and one would hide the other', () => {
  const shared = Object.keys(UNIVERSAL_ERROR_STATUS).filter((code) => Object.hasOwn(DECLARED_ERROR_STATUS, code));

  assert.deepEqual(shared, []);
  assert.equal(
    Object.keys(ERROR_STATUS).length,
    Object.keys(UNIVERSAL_ERROR_STATUS).length + Object.keys(DECLARED_ERROR_STATUS).length
  );
});

test('every code is written in capitals with underscores, and its status is an HTTP error status', () => {
  for (const [code, status] of Object.entries(ERROR_STATUS)) {
    assert.match(code, /^[A-Z]+(?:_[A-Z]+)*$/);
    assert.ok(status >= 400 && status <= 599, `${code} has status ${status}`);
  }
});

test('isUniversalErrorCode knows the universal codes from the rest', () => {
  assert.equal(isUniversalErrorCode('INTERNAL'), true);
  assert.equal(isUniversalErrorCode('NOT_FOUND'), false);
  assert.equal(isUniversalErrorCode('NO_SUCH_CODE'), false);
  // A name every object has is not a code
  assert.equal(isUniversalErrorCode('toString'), false);
});
