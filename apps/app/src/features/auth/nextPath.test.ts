// Where someone goes after signing in. To run it, in apps/app: node --test src/features/auth/nextPath.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextPathFrom } from './nextPath.ts';

test('an address of the app is kept, with its query and its fragment', () => {
  assert.equal(nextPathFrom('/'), '/');
  assert.equal(nextPathFrom('/spaces/abc/files/def'), '/spaces/abc/files/def');
  assert.equal(nextPathFrom('/join/abc?from=mail#top'), '/join/abc?from=mail#top');
});

test('an address that leads to another site is dropped', () => {
  for (const value of [
    'https://evil.example.com/',
    '//evil.example.com/',
    '/\\evil.example.com/',
    '/\\/evil.example.com/',
    '\\\\evil.example.com/',
    'javascript:alert(1)',
    ' /spaces',
    'spaces/abc',
    ''
  ]) {
    assert.equal(nextPathFrom(value), undefined, JSON.stringify(value));
  }
});

test('what is not text is dropped', () => {
  for (const value of [undefined, null, 1, true, ['/spaces'], { to: '/spaces' }]) {
    assert.equal(nextPathFrom(value), undefined, JSON.stringify(value));
  }
});

test('dots in the path are worked out, and stay inside the app', () => {
  assert.equal(nextPathFrom('/spaces/../../settings'), '/settings');
});
